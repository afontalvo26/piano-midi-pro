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
