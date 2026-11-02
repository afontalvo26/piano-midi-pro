import { expect, test } from "@playwright/test";

test("new Studio uses reference layout with actual project data and a live piano roll", async ({page}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/", {waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await expect(shell).toBeVisible();
  await expect(shell.getByRole("navigation", {name:"Flujos de trabajo"})).toBeVisible();
  await expect(shell.getByRole("group", {name:"Transporte"})).toBeVisible();
  await expect(shell.getByRole("region", {name:"Mezcla rápida"})).toBeVisible();
  await expect(shell.getByRole("complementary", {name:"Instrumento e inspector"})).toBeVisible();
  await expect(shell.getByRole("button", {name:"Nueva idea"})).toBeVisible();
  await expect(shell.locator(".ref-system-status").filter({hasText:"Latencia"}))
    .toContainText(/Sin medir|≈\\d+ ms/);
  await shell.getByRole("button", {name:"Nueva idea"}).click();
  await expect(shell.getByRole("region", {name:"Arreglo del proyecto"}).locator(".ref-track-row").first())
    .toBeVisible({timeout:20_000});
  await expect(shell.getByRole("region", {name:"Editor musical"}).locator(".piano-roll__viewport")).toBeVisible();
  await expect(shell.getByRole("button", {name:"Abrir el editor completo"})).toBeVisible();
  const areas=await page.evaluate(()=>{
    const pick=(selector:string)=>{
      const element=document.querySelector(selector);
      if(!element)throw new Error("Área ausente: "+selector);
      const r=element.getBoundingClientRect();
      return {x:r.x,y:r.y,width:r.width,height:r.height};
    };
    return {header:pick(".ref-topbar"),sidebar:pick(".ref-sidebar"),
      arrangement:pick(".ref-arrangement"),editor:pick(".ref-editor"),
      inspector:pick(".ref-inspector"),mixer:pick(".ref-mixer")};
  });
  expect(areas.header.height).toBeGreaterThanOrEqual(60);
  expect(areas.sidebar.width).toBeGreaterThanOrEqual(225);
  expect(areas.arrangement.x).toBeLessThan(areas.inspector.x);
  expect(areas.arrangement.y).toBeLessThan(areas.editor.y);
  expect(areas.editor.y).toBeLessThan(areas.mixer.y);
  expect(areas.mixer.width).toBeGreaterThan(areas.editor.width);
  // Lock the 1586×992 composition from the approved mockup. These are real
  // DOM geometry assertions; the screenshot attachment is reviewed separately.
  const target = {
    header: {x:0,y:0,width:1586,height:64},
    sidebar:{x:0,y:64,width:238},
    arrangement:{x:244,y:70,width:1013,height:287},
    editor:{x:244,y:362,width:1013,height:315},
    inspector:{x:1262,y:70,width:318,height:607},
    mixer:{x:244,y:682,width:1336,height:183},
  };
  for (const name of Object.keys(target) as (keyof typeof target)[]) {
    const rect=areas[name];
    const expected=target[name];
    for (const key of Object.keys(expected) as (keyof typeof rect)[]) {
      const value=expected[key as keyof typeof expected];
      expect(Math.abs(rect[key]-Number(value)), name+"."+key).toBeLessThanOrEqual(3);
    }
  }
  await testInfo.attach("studio-reference-desktop.png", {
    body:await page.screenshot(),contentType:"image/png",
  });
});

test("reference Studio mixer and navigation use real reversible project callbacks", async ({page}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/", {waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await shell.getByRole("button", {name:"Nueva idea"}).click();
  const channel=shell.locator(".ref-channel").first();
  await expect(channel).toBeVisible();
  const mute=channel.getByRole("button", {name:/Silenciar/});
  await expect(mute).toHaveAttribute("aria-pressed","false");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed","true");
  await mute.click();
  await expect(mute).toHaveAttribute("aria-pressed","false");
  await shell.getByRole("button", {name:"Editor completo"}).first().click();
  await expect(page.getByRole("button", {name:/Volver al nuevo Studio/})).toBeVisible();
  await page.getByRole("button", {name:/Volver al nuevo Studio/}).click();
  await expect(shell).toBeVisible();
});

test("reference Studio preserves touch navigation and horizontal channel scroll", async ({page}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({width:390,height:844});
  await page.goto("/", {waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await expect(shell).toBeVisible();
  await expect(shell.locator(".ref-topbar")).toBeVisible();
  await expect(shell.locator(".ref-sidebar")).toBeVisible();
  await expect(shell.getByRole("group", {name:"Transporte"})).toBeVisible();
  const geometry=await page.evaluate(()=>{
    const sidebar=document.querySelector(".ref-sidebar")!.getBoundingClientRect();
    const root=document.querySelector(".ref-studio")!.getBoundingClientRect();
    return {rootWidth:root.width,sidebarWidth:sidebar.width,wholeScroll:document.documentElement.scrollWidth};
  });
  expect(geometry.sidebarWidth).toBeLessThan(75);
  expect(geometry.rootWidth).toBeLessThanOrEqual(390);
  expect(geometry.wholeScroll).toBeLessThanOrEqual(390);
  await testInfo.attach("studio-reference-mobile.png",{
    body:await page.screenshot(),contentType:"image/png",
  });
});

test("instrument catalog opens inside the new inspector and closes without changing pages", async ({page}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/", {waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await shell.getByRole("button", {name:"Biblioteca"}).click();
  await expect(shell.getByRole("dialog", {name:"Biblioteca de instrumentos"})).toBeVisible();
  await expect(shell.getByLabel("Familia de instrumentos")).toBeVisible();
  await expect(shell.getByLabel("Motor de sonido")).toBeVisible();
  await shell.getByRole("button", {name:"Cerrar biblioteca"}).click();
  await expect(shell.getByRole("dialog", {name:"Biblioteca de instrumentos"})).toHaveCount(0);
  await expect(shell.getByRole("region", {name:"Editor musical"})).toBeVisible();
});


test("approved Studio timeline uses real reversible clip draw and split operations", async ({page}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/", {waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await shell.getByRole("button", {name:"Nueva idea"}).click();
  const firstRow=shell.locator(".ref-track-row").first();
  await expect(firstRow.locator(".ref-clip")).toHaveCount(1);
  await shell.getByRole("button", {name:"Dibujar"}).click();
  const lane=firstRow.locator(".ref-track-lane");
  const bounds=await lane.boundingBox();
  expect(bounds).not.toBeNull();
  await lane.click({position:{x:Math.round(bounds!.width*.65),y:24}});
  await expect(firstRow.locator(".ref-clip")).toHaveCount(2);
  await shell.getByRole("button", {name:"Cortar"}).click();
  const firstClip=firstRow.locator(".ref-clip").first();
  const clipBounds=await firstClip.boundingBox();
  expect(clipBounds).not.toBeNull();
  await firstClip.click({position:{x:Math.round(clipBounds!.width*.5),y:15}});
  await expect(firstRow.locator(".ref-clip")).toHaveCount(3);
  await shell.getByRole("button", {name:"Seleccionar"}).click();
  await firstRow.locator(".ref-clip").first().click();
  await expect(shell.getByRole("button", {name:/Cuantizar/})).toBeVisible();
});

test("real performance keyboard supports octave movement and three pedals",async ({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/", {waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await shell.getByRole("navigation",{name:"Flujos de trabajo"})
    .getByRole("button",{name:"Interpretar"}).click();
  const keyboard=shell.getByRole("group",{name:"Piano virtual"});
  await expect(keyboard.locator(".piano-key-element")).toHaveCount(37);
  const firstKey=keyboard.locator(".piano-key-element.white").first();
  await firstKey.dispatchEvent("pointerdown",{pointerId:12,pointerType:"mouse"});
  const lastStrike=await page.evaluate(async()=>{
    const {getLivePerformanceSnapshot}=await import("/src/components/studio/livePerformanceStore.ts");
    return getLivePerformanceSnapshot().lastStrike;
  });
  expect(lastStrike?.source).toBe("mouse");
  expect(lastStrike?.playedNote).toBeGreaterThanOrEqual(21);
  await firstKey.dispatchEvent("pointerup",{pointerId:12,pointerType:"mouse"});
  const range=await shell.locator(".ref-performance-toolbar>span").first().textContent();
  await shell.getByRole("button",{name:"Octava siguiente"}).click();
  await expect(shell.locator(".ref-performance-toolbar>span").first()).not.toHaveText(range!);
  const pedal=shell.getByRole("group",{name:"Pedales virtuales"}).getByRole("button",{name:"Sustain"});
  await pedal.dispatchEvent("pointerdown",{pointerId:1,pointerType:"mouse"});
  await expect(pedal).toHaveAttribute("aria-pressed","true");
  await pedal.dispatchEvent("pointerup",{pointerId:1,pointerType:"mouse"});
  await expect(pedal).toHaveAttribute("aria-pressed","false");
});

test("four instrument macro controls create real persisted validated processors",async ({page})=>{
  test.setTimeout(90_000);
  await page.goto("/", {waitUntil:"domcontentloaded"});
  const result=await page.evaluate(async()=>{
    const {createProjectDocument}=await import("/src/project/model.ts");
    const {applyCommand}=await import("/src/project/commands.ts");
    const {applyStudioMacro,readStudioMacro}=await import("/src/components/studio/studioMacros.ts");
    const base=createProjectDocument({id:"macro-ui-test",at:1});
    const mix={gainDb:0,pan:0,mute:false,solo:false,armed:false,
      effects:[],sends:[]};
    const track={id:"test-track",name:"Instrumento",kind:"audio" as const,mix};
    let doc: ReturnType<typeof createProjectDocument>={...base,tracks:[track],trackOrder:[track.id]};
    for(const [kind,value] of [["brightness",38],["body",75],["reverb",42],["dynamics",60]] as const){
      const current=doc.tracks[0]!.mix.effects;
      const next=applyStudioMacro(current,track.id,kind,value);
      const applied=applyCommand(doc,{kind:"replaceTrackEffects",trackId:track.id,
        expected:current,effects:next,at:2});
      doc=applied.document;
    }
    const effects=doc.tracks[0]!.mix.effects;
    return {count:effects.length,ids:effects.map(e=>e.id),
      values:["brightness","body","reverb","dynamics"].map((kind)=>
        readStudioMacro(effects,track.id,kind as "brightness"|"body"|"reverb"|"dynamics")),
      kinds:effects.map(e=>e.kind)};
  });
  expect(result.count).toBe(4);
  expect(result.values).toEqual([38,75,42,60]);
  expect(result.kinds).toEqual(["filter","eq3","reverb","compressor"]);
});


test("Partitura shows real project notes and returns to editing",async({page})=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await shell.getByRole("button",{name:"Nueva idea"}).click();
  await shell.getByRole("button",{name:"Partitura"}).click();
  await expect(shell.getByRole("region",{name:"Partitura de lectura"})).toBeVisible();
  await expect(shell.getByRole("img",{name:/Partitura de/})).toBeVisible();
  await shell.getByRole("button",{name:"Piano Roll"}).click();
  await expect(shell.getByRole("region",{name:"Partitura de lectura"})).toHaveCount(0);
  await expect(shell.locator(".piano-roll__viewport")).toBeVisible();
});


test("the reference inspector performs real reversible clip mute and delete",async({page})=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await shell.getByRole("button",{name:"Nueva idea"}).click();
  const clip=shell.locator(".ref-track-row").first().locator(".ref-clip").first();
  await clip.click();
  await shell.getByRole("button",{name:"Inspector",exact:true}).click();
  await expect(shell.getByText("Clip seleccionado")).toBeVisible();
  await shell.getByRole("button",{name:"Silenciar clip"}).click();
  await expect(clip).toHaveClass(/is-muted/);
  await shell.getByRole("button",{name:"Activar clip"}).click();
  await expect(clip).not.toHaveClass(/is-muted/);
  await shell.getByRole("button",{name:"Eliminar clip"}).click();
  await expect(shell.locator(".ref-track-row").first().locator(".ref-clip")).toHaveCount(0);
});


test("quick quantize is a real versioned and reversible pattern edit",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const result=await page.evaluate(async()=>{
    const {createProjectDocument}=await import("/src/project/model.ts");
    const {applyCommand}=await import("/src/project/commands.ts");
    const {quantizeStudioClip}=await import("/src/components/studio/referenceArrangementActions.ts");
    const mix={gainDb:0,pan:0,mute:false,solo:false,armed:false,effects:[],sends:[]};
    const track={id:"quantize-track",name:"Piano",kind:"instrument" as const,
      instrument:{instrumentId:"salamander",packageVersion:"1",presetId:"natural"},mix};
    const pattern={id:"quantize-pattern",name:"Patrón",version:1,lengthTicks:3840,
      notes:[{id:"note",startTick:125,durationTick:312,pitch:60,velocity:99,
        releaseVelocity:64,channel:0,origin:{kind:"drawn" as const}}],expression:[]};
    const clip={id:"quantize-clip",kind:"pattern" as const,trackId:track.id,
      sourceId:pattern.id,sourceVersion:1,startTick:0,lengthTicks:3840,
      sourceOffsetTick:0,loopMode:"none" as const,tailPolicy:"cut" as const,
      transpose:0,gainDb:0,muted:false};
    const doc={...createProjectDocument({id:"quantize-qa",at:1}),
      tracks:[track],trackOrder:[track.id],patterns:[pattern],clips:[clip]};
    const command=quantizeStudioClip(doc,clip.id);
    if(!command)throw new Error("Se esperaba un comando de cuantización");
    const next=applyCommand(doc,command);
    const restored=applyCommand(next.document,next.inverse);
    return {kind:command.kind,before:doc.patterns[0]!.notes[0]!.startTick,
      after:next.document.patterns[0]!.notes[0]!.startTick,
      afterDuration:next.document.patterns[0]!.notes[0]!.durationTick,
      undone:restored.document.patterns[0]!.notes[0]!.startTick};
  });
  expect(result).toEqual({kind:"replacePattern",before:125,after:240,
    afterDuration:240,undone:125});
});

test("loop UI and ruler are connected to transport state",async({page})=>{
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await shell.getByRole("button",{name:"Nueva idea"}).click();
  const enableLoop=shell.getByRole("button",{name:"Activar bucle"});
  await expect(enableLoop).toHaveAttribute("aria-pressed","false");
  await enableLoop.click();
  const disableLoop=shell.getByRole("button",{name:"Desactivar bucle"});
  await expect(disableLoop).toHaveAttribute("aria-pressed","true");
  const slider=shell.getByRole("slider",{name:"Mover cabezal de reproducción"});
  await slider.focus();
  await slider.press("ArrowRight");
  await expect(slider).toHaveAttribute("aria-valuenow","240");
  await disableLoop.click();
  await expect(enableLoop).toHaveAttribute("aria-pressed","false");
});


test("the reference loop start and length can be edited and remain musical",async({page})=>{
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await shell.getByRole("button",{name:"Nueva idea"}).click();
  await shell.getByRole("button",{name:"Editar región de bucle"}).click();
  const form=shell.getByRole("form",{name:"Cambiar inicio y final del bucle"});
  await expect(form).toBeVisible();
  await form.getByLabel("Desde compás").fill("3");
  await form.getByLabel("Hasta compás").fill("9");
  await form.getByRole("button",{name:"Aplicar bucle"}).click();
  await expect(shell.getByRole("button",{name:"Editar región de bucle"}))
    .toContainText("Compás 3 – 9");
  await shell.getByRole("button",{name:"Activar bucle"}).click();
  await expect(shell.locator(".ref-loop-marker")).toBeVisible();
});

test("time-signature changes drive bar mapping instead of fixed 4/4 assumptions",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const mapped=await page.evaluate(async()=>{
    const {studioBarStartTick,studioBarNumberAtTick,studioLoopBarRange}=
      await import("/src/components/studio/studioMusicalBars.ts");
    const meters=[
      {tick:0,numerator:4,denominator:4},
      {tick:7680,numerator:3,denominator:4}
    ];
    return {b1:studioBarStartTick(meters,1),
      b3:studioBarStartTick(meters,3),
      b4:studioBarStartTick(meters,4),
      at7900:studioBarNumberAtTick(meters,7900),
      loop:studioLoopBarRange(meters,3,4)};
  });
  expect(mapped).toEqual({b1:0,b3:7680,b4:10560,at7900:3,
    loop:{startTick:7680,endTick:13440}});
});

test("reference shell labels MIDI ports generically rather than claiming an unobserved model",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const shell=page.getByTestId("reference-studio");
  await expect(shell.getByRole("button",{name:"Avanzar un compás"})).toBeVisible();
  await expect(shell.getByRole("button",{name:"Deshacer"})).toBeVisible();
  await expect(shell.getByRole("button",{name:"Rehacer"})).toBeVisible();
  await expect(shell.getByText("SMK-37 conectado")).toHaveCount(0);
});


test("take recording opens the real overdub workflow in the new Studio",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const studio=page.getByTestId("reference-studio");
  await studio.getByRole("button",{name:"Nueva idea"}).click();
  await studio.getByRole("button",{name:"Ver tomas MIDI y overdub"}).click();
  const takes=studio.getByRole("dialog",{name:"Tomas MIDI del proyecto"});
  await expect(takes).toBeVisible();
  await expect(takes.getByRole("region",{name:"Agregar toma al patrón"})).toBeVisible();
  await takes.getByRole("button",{name:"Cerrar tomas MIDI"}).click();
  await expect(takes).toHaveCount(0);
});

test("per-track sound assignment is CAS versioned, undoable and independent of live catalog",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const result=await page.evaluate(async()=>{
    const {createProjectDocument}=await import("/src/project/model.ts");
    const {applyCommand}=await import("/src/project/commands.ts");
    const original={instrumentId:"salamander-grand",packageVersion:"verified",presetId:"natural"};
    const changed={instrumentId:"tr808-fischer-core",packageVersion:"verified",presetId:"core"};
    const track={id:"per-track-instrument",name:"Piano",kind:"instrument" as const,
      instrument:original,
      mix:{gainDb:0,pan:0,mute:false,solo:false,armed:false,sends:[],effects:[]}};
    const doc={...createProjectDocument({id:"track-bank-check",at:1}),
      trackOrder:[track.id],tracks:[track]};
    const command={kind:"replaceTrackInstrument" as const,trackId:track.id,
      expected:original,instrument:changed,at:2};
    const applied=applyCommand(doc,command);
    const reverted=applyCommand(applied.document,applied.inverse);
    const redone=applyCommand(reverted.document,reverted.inverse);
    return {initial:doc.tracks[0]!.instrument?.instrumentId,
      after:applied.document.tracks[0]!.instrument?.instrumentId,
      undo:reverted.document.tracks[0]!.instrument?.instrumentId,
      redo:redone.document.tracks[0]!.instrument?.instrumentId,
      sameOtherState:JSON.stringify(redone.document.tracks[0]!.mix)===JSON.stringify(track.mix)};
  });
  expect(result).toEqual({initial:"salamander-grand",after:"tr808-fischer-core",
    undo:"salamander-grand",redo:"tr808-fischer-core",sameOtherState:true});
});

test("studio instrument catalog distinguishes global live sound from per-track verified banks",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const studio=page.getByTestId("reference-studio");
  await studio.getByRole("button",{name:"Nueva idea"}).click();
  await studio.getByRole("navigation",{name:"Flujos de trabajo"})
    .getByRole("button",{name:"Biblioteca"}).click();
  const picker=studio.getByRole("dialog",{name:"Biblioteca de instrumentos"});
  await expect(picker.getByLabel("Banco sonoro de pista")).toBeVisible();
  await expect(picker.getByText(/catálogo inferior cambia sólo el sonido de interpretación/)).toBeVisible();
});


test("shared pattern quantization requires Make Unique and leaves sibling notes unchanged",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const result=await page.evaluate(async()=>{
    const {createProjectDocument}=await import("/src/project/model.ts");
    const {applyCommand}=await import("/src/project/commands.ts");
    const {quantizeStudioClip}=await import("/src/components/studio/referenceArrangementActions.ts");
    const {uniqueArrangementClip}=await import("/src/composition/arrangementModel.ts");
    const trackId="unique-track";
    const pattern={id:"shared-pattern",name:"Patrón compartido",version:1,lengthTicks:3840,
      notes:[{id:"note-a",startTick:125,durationTick:260,pitch:60,velocity:100,
        releaseVelocity:64,channel:0,origin:{kind:"drawn" as const}}],expression:[]};
    const makeClip=(id:string,startTick:number)=>({
      id,kind:"pattern" as const,trackId,sourceId:pattern.id,
      sourceVersion:1,startTick,lengthTicks:3840,sourceOffsetTick:0,
      loopMode:"loop" as const,tailPolicy:"cut" as const,transpose:0,gainDb:0,muted:false
    });
    const doc={...createProjectDocument({id:"shared-quantize",at:1}),
      trackOrder:[trackId],
      tracks:[{id:trackId,name:"Piano",kind:"instrument" as const,
        mix:{gainDb:0,pan:0,mute:false,solo:false,armed:false,sends:[],effects:[]}}],
      patterns:[pattern],clips:[makeClip("clip-a",0),makeClip("clip-b",3840)]};
    let rejected=false;
    try{quantizeStudioClip(doc,"clip-a");}catch{rejected=true;}
    const separated=applyCommand(doc,uniqueArrangementClip(doc,"clip-a",2));
    const quantizedCommand=quantizeStudioClip(separated.document,"clip-a");
    if(!quantizedCommand)throw new Error("Missing quantize command");
    const modified=applyCommand(separated.document,quantizedCommand);
    const other=modified.document.clips.find(c=>c.id==="clip-b");
    const target=modified.document.clips.find(c=>c.id==="clip-a");
    return {rejected,otherStart:modified.document.patterns.find(p=>p.id===other?.sourceId)?.notes[0]?.startTick,
      targetStart:modified.document.patterns.find(p=>p.id===target?.sourceId)?.notes[0]?.startTick,
      differentPattern:other?.sourceId!==target?.sourceId};
  });
  expect(result).toEqual({rejected:true,otherStart:125,targetStart:240,differentPattern:true});
});


test("compact inspector trims and duplicates MIDI clips using project history",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  await page.setViewportSize({width:1586,height:992});
  const studio=page.getByTestId("reference-studio");
  await studio.getByRole("button",{name:"Nueva idea"}).click();
  const row=studio.locator(".ref-track-row").first();
  await row.locator(".ref-clip").first().click();
  await studio.getByRole("button",{name:"Inspector",exact:true}).click();
  const length=studio.getByRole("spinbutton",{name:"Duración del clip en ticks"});
  await expect(length).toHaveValue("15360");
  await length.fill("9600");
  await length.press("Tab");
  await expect(length).toHaveValue("9600");
  await studio.getByRole("button",{name:"Duplicar clip"}).click();
  await expect(row.locator(".ref-clip")).toHaveCount(2);
  await studio.getByRole("button",{name:"Deshacer"}).click();
  await expect(row.locator(".ref-clip")).toHaveCount(1);
  await studio.getByRole("button",{name:"Rehacer"}).click();
  await expect(row.locator(".ref-clip")).toHaveCount(2);
});


test("Studio arranger pages beyond bar 16, zooms and edits visible later measures",async({page})=>{
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const studio=page.getByTestId("reference-studio");
  await studio.getByRole("button",{name:"Nueva idea"}).click();
  const navigation=studio.getByRole("group",{name:"Navegación del arreglo"});
  await expect(navigation).toContainText("1–16");
  await navigation.getByRole("button",{name:"Compases siguientes"}).click();
  await expect(navigation).toContainText("17–32");
  const ruler=studio.getByRole("slider",{name:"Mover cabezal de reproducción"});
  await expect(ruler).toHaveAttribute("aria-valuemin","61440");
  await expect(studio.locator(".ref-track-row").first().locator(".ref-clip")).toHaveCount(0);
  await navigation.getByLabel("Compases visibles").selectOption("8");
  await expect(navigation).toContainText("17–24");
  await studio.getByRole("button",{name:"Dibujar"}).click();
  const lane=studio.locator(".ref-track-row").first().locator(".ref-track-lane");
  const rect=await lane.boundingBox();
  expect(rect).not.toBeNull();
  await lane.click({position:{x:Math.floor(rect!.width*.15),y:20}});
  await expect(lane.locator(".ref-clip")).toHaveCount(1);
  await navigation.getByRole("button",{name:"Centrar cabezal"}).click();
  await expect(navigation).toContainText("1–8");
  await expect(lane.locator(".ref-clip")).toHaveCount(1);
  // The original opening clip is visible again, not the later drawing.
  await navigation.getByRole("button",{name:"Compases siguientes"}).click();
  await navigation.getByRole("button",{name:"Compases siguientes"}).click();
  await expect(navigation).toContainText("17–24");
  await expect(lane.locator(".ref-clip")).toHaveCount(1);
});

test("moving to next bar uses meter map rather than current time-signature width",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const output=await page.evaluate(async()=>{
    const {studioBarStartTick,studioBarNumberAtTick}=await import("/src/components/studio/studioMusicalBars.ts");
    const map=[{tick:0,numerator:4,denominator:4},{tick:7680,numerator:3,denominator:4}];
    const values=[0,3900,8000,10600].map(tick=>
      studioBarStartTick(map,studioBarNumberAtTick(map,tick)+1));
    return values;
  });
  expect(output).toEqual([3840,7680,10560,13440]);
});


test("project browser stays in the new Studio shell and creates a project without legacy navigation",async({page})=>{
  await page.setViewportSize({width:1586,height:992});
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const studio=page.getByTestId("reference-studio");
  await studio.locator(".ref-project-select").click();
  const dialog=studio.getByRole("dialog",{name:"Gestión de proyectos"});
  await expect(dialog.getByRole("heading",{name:"Tus proyectos"})).toBeVisible();
  await expect(dialog.getByRole("heading",{name:"Pistas de tus grabaciones MIDI"})).toBeVisible();
  await expect(studio).toBeVisible();
  await dialog.getByRole("textbox",{name:"Nombre del proyecto"}).fill("Prueba modal propia");
  await dialog.getByRole("button",{name:"Crear proyecto"}).click();
  await expect(dialog).toHaveCount(0);
  await expect(studio.locator(".ref-project-select")).toContainText("Prueba modal propia");
  await studio.locator(".ref-project-select").click();
  await expect(dialog.getByText("Prueba modal propia")).toBeVisible();
  await dialog.getByRole("button",{name:"Cerrar gestión de proyectos"}).click();
  await expect(dialog).toHaveCount(0);
});

test("project management modal can be dismissed without mutating the active project",async({page})=>{
  await page.goto("/",{waitUntil:"domcontentloaded"});
  const studio=page.getByTestId("reference-studio");
  await studio.getByRole("button",{name:"Nueva idea"}).click();
  const before=await studio.locator(".ref-project-select strong").first().textContent();
  await studio.locator(".ref-project-select").click();
  const dialog=studio.getByRole("dialog",{name:"Gestión de proyectos"});
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button",{name:"Cerrar gestión de proyectos"}).click();
  await expect(dialog).toHaveCount(0);
  await expect(studio.locator(".ref-project-select strong").first()).toHaveText(before!);
});
