#!/usr/bin/env node
// Drive headless Chrome over the DevTools protocol: real key presses, clicks, evals and screenshots.
// Used to check interactive behaviour (Cmd+K, forms) that a static screenshot cannot show.
//
//   node tools/dev/cdp.mjs <url> <width> <height> '<steps json>'
//
// Steps: {"wait":500} {"key":"k","meta":true} {"key":"ArrowDown"} {"text":"acetone"} {"click":"css selector"}
//        {"eval":"document.title"} {"shot":"/abs/path.png"} {"waitFor":"css selector"}
//        {"errors":true} prints console errors, warnings and uncaught exceptions seen so far (hydration errors included)
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, width = "1440", height = "900", stepsJson = "[]"] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
// Ask the OS for a free port, so several runs at once never pick the same one.
const port = await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
        const { port: free } = probe.address();
        probe.close(() => resolve(free));
    });
});
const chrome = spawn(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ["--headless=new", "--disable-gpu", "--hide-scrollbars", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`, `--window-size=${width},${height}`, "about:blank"],
    { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        target = list.find((t) => t.type === "page");
    } catch {}
}
if (!target) {
    chrome.kill();
    throw new Error("Chrome did not start");
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
// Console errors, warnings and uncaught exceptions since the page started loading ({"errors":true} prints them).
const problems = [];
const argText = (arg) => arg.value ?? arg.description ?? arg.unserializableValue ?? arg.type;
ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
    } else if (msg.method === "Runtime.consoleAPICalled" && (msg.params.type === "error" || msg.params.type === "warning")) {
        problems.push(`${msg.params.type}: ${msg.params.args.map(argText).join(" ").slice(0, 600)}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
        const detail = msg.params.exceptionDetails;
        problems.push(`exception: ${(detail.exception?.description ?? detail.text ?? "").slice(0, 600)}`);
    }
};
const send = (method, params = {}) =>
    new Promise((resolve) => {
        const id = ++seq;
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
    });
const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    return r.result?.exceptionDetails ? `ERROR ${r.result.exceptionDetails.text}` : r.result?.result?.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: Number(width) < 600 });
await send("Page.navigate", { url });
await sleep(2500);

const KEYS = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, Tab: 9, Backspace: 8, "/": 191 };
for (const step of steps) {
    if (step.wait) await sleep(step.wait);
    else if (step.waitFor) {
        for (let i = 0; i < 40; i++) {
            if (await evaluate(`!!document.querySelector(${JSON.stringify(step.waitFor)})`)) break;
            await sleep(250);
        }
    } else if (step.key) {
        const modifiers = (step.alt ? 1 : 0) | (step.ctrl ? 2 : 0) | (step.meta ? 4 : 0) | (step.shift ? 8 : 0);
        const code = KEYS[step.key] ?? step.key.toUpperCase().charCodeAt(0);
        const base = { key: step.key, code: step.key.length === 1 ? `Key${step.key.toUpperCase()}` : step.key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code, modifiers };
        await send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base });
        await send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
        await sleep(150);
    } else if (step.text) {
        for (const ch of step.text) {
            await send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, key: ch, unmodifiedText: ch });
            await send("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
            await sleep(25);
        }
        await sleep(250);
    } else if (step.click) {
        const box = await evaluate(`(() => { const el = document.querySelector(${JSON.stringify(step.click)}); if (!el) return null; el.scrollIntoView({block:"center"}); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (!box) console.log(`click: no element for ${step.click}`);
        else {
            await send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
            await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
            await sleep(300);
        }
    } else if (step.eval) console.log(JSON.stringify(await evaluate(step.eval)));
    else if (step.errors) console.log(JSON.stringify(problems.length ? problems : "no console errors or warnings"));
    else if (step.shot) {
        const r = await send("Page.captureScreenshot", { format: "png" });
        writeFileSync(step.shot, Buffer.from(r.result.data, "base64"));
    }
}
ws.close();
chrome.kill();
