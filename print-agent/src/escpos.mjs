import net from "node:net";

const cp850 = new Map(Object.entries({
  "á":160,"í":161,"ó":162,"ú":163,"Á":181,"Í":214,"Ó":224,"Ú":233,
  "é":130,"É":144,"â":131,"Â":182,"ã":198,"Ã":199,"õ":228,"Õ":229,
  "ê":136,"Ê":210,"ô":147,"Ô":226,"ç":135,"Ç":128,"à":133,"À":183,
}));

function textBytes(text) {
  const bytes = [];
  for (const char of text) {
    if (char === "\u00a0" || char === "\u202f") { bytes.push(32); continue; }
    if (cp850.has(char)) { bytes.push(cp850.get(char)); continue; }
    const code = char.charCodeAt(0);
    bytes.push((code >= 32 && code <= 126) || code === 10 || code === 13 ? code : 63);
  }
  return Buffer.from(bytes);
}

export function escposDocument(text) {
  return Buffer.concat([
    Buffer.from([0x1b,0x40,0x1b,0x74,0x02,0x1b,0x61,0x00]),
    textBytes(text), Buffer.from([0x0a,0x0a,0x1d,0x56,0x00]),
  ]);
}

export async function probeNetwork({ address, port }, timeoutMs = 2500) {
  if (!address || !port) throw new Error("network printer requires address and port");
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: address, port: Number(port) });
    const timer = setTimeout(() => socket.destroy(new Error("printer probe timeout")), timeoutMs);
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
    socket.once("connect", () => { clearTimeout(timer); socket.end(); resolve(); });
  });
}

export async function printNetwork({ address, port }, text, copies = 1) {
  if (!address || !port) throw new Error("network printer requires address and port");
  const payload = escposDocument(text);
  for (let copy = 0; copy < copies; copy += 1) {
    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: address, port: Number(port) });
      const timer = setTimeout(() => socket.destroy(new Error("printer timeout")), 10_000);
      socket.once("error", (error) => { clearTimeout(timer); reject(error); });
      socket.once("connect", () => socket.end(payload));
      socket.once("close", (hadError) => {
        clearTimeout(timer);
        if (!hadError) resolve();
      });
    });
  }
}
