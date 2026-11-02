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
  await expect(shell.getByText("Sin medir")).toBeVisible();
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
