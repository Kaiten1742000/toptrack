// Baut toptrack-daten.js aus den Spotify-Zahlen von kworb.net
// Läuft wöchentlich per GitHub Actions (siehe .github/workflows/update-data.yml)
// Lokal: node scripts/build-data.mjs   (Node 18+)

import { writeFileSync } from "node:fs";

const BASE = "https://kworb.net/spotify/";
const CONCURRENCY = 6;
const SONGS_PER_ARTIST = 20;
const OUT = new URL("../toptrack-daten.js", import.meta.url);

/* ---------------- Hilfsfunktionen ---------------- */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = s => +String(s).replace(/[^\d]/g, "") || 0;
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m);
const strip = s => decode(s.replace(/<[^>]*>/g, "")).trim();

async function get(path) {
  for (let t = 0; t < 4; t++) {
    try {
      const r = await fetch(BASE + path, { headers: { "User-Agent": "toptrack-game-weekly-update (private quiz game)" } });
      if (r.ok) return await r.text();
      if (r.status === 404) return null;
    } catch (e) {}
    await sleep(2000 * (t + 1));
  }
  return null;
}

/* ---------------- Parser (reine String-Verarbeitung) ---------------- */
function rows(html, tableIndex = 0) {
  const tables = html.split(/<table/i).slice(1);
  const t = tables[tableIndex] || "";
  const body = (t.match(/<tbody>([\s\S]*?)<\/tbody>/i) || [])[1] || "";
  return body.split(/<tr[^>]*>/i).slice(1).map(r => r.split(/<\/tr>/i)[0]);
}
const cells = row => (row.match(/<td[^>]*>[\s\S]*?<\/td>/gi) || []);

function parseListeners(html) {
  const out = [];
  for (const r of rows(html)) {
    const m = r.match(/href="artist\/([A-Za-z0-9]+)_songs\.html">([\s\S]*?)<\/a>/);
    if (!m) continue;
    const td = cells(r);
    out.push({ id: m[1], name: strip(m[2]), listeners: num(strip(td[2] || "")) });
  }
  return out;
}

function parseCountryTotals(html) {
  const out = [];
  for (const r of rows(html)) {
    const a = r.match(/href="\.\.\/artist\/([A-Za-z0-9]+)\.html">/);
    const t = r.match(/href="\.\.\/track\/[A-Za-z0-9]+\.html">([\s\S]*?)<\/a>/);
    if (!a) continue;
    const td = cells(r);
    out.push({ id: a[1], title: t ? strip(t[1]) : "", total: num(strip(td[td.length - 1] || "")) });
  }
  return out;
}

function parseSongs(html) {
  const out = [];
  for (const r of rows(html, 1)) {
    const td = cells(r); if (td.length < 2) continue;
    const first = td[0];
    if (/<div>\s*\*/.test(first)) continue;            // nur Feature → überspringen
    const m = first.match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!m) continue;
    out.push([strip(m[2]), m[1], num(strip(td[1]))]);
  }
  return out;
}

/* ---------------- Sprach-Erkennung ---------------- */
const G = { en: ["us", "gb", "au", "ca"], de: ["de", "at", "ch"], fr: ["fr", "be"], it: ["it"], es: ["es", "mx", "ar", "co", "cl"],
  pt: ["br", "pt"], ko: ["kr"], ja: ["jp"], tr: ["tr"], xx: ["nl", "se", "no", "dk", "fi", "pl"] };
const COUNTRIES = Object.values(G).flat();

const W = {
  en: "the you me my i love it to and of in on your don't dont i'm im we all be baby night like with what girl heart time up down one need know want can't feel never go got this that is are was for no way life world",
  de: "ich du und die der das nicht mein meine mit für ein eine ist wir mich dich auf nur liebe alles keine wie was zu von im nacht herz bin bist hab kein dein deine immer wieder noch mal schon mehr ohne",
  es: "que el me mi te tu amor y los las una por con sin como quiero corazón nada todo más eres yo qué cómo vida noche quién mía mío ella bebé solo otra vez",
  fr: "je le les pas mon ma moi toi et des une est c'est qui pour dans ça avec sur plus vie nous suis tout rien elle comme mes tes",
  it: "che non il mi ti sei per una con io amore cosa più della del sono ancora tutto quando come anche niente cuore notte",
  pt: "não você eu que o meu minha com um uma se sem amor coração vida tudo mais pra tá é tu ela vai me te nóis",
  tr: "bir ben sen ve bu ne gibi için değil aşk seni beni gel var yok kadar daha çok bana sana gece",
};
const WS = Object.fromEntries(Object.entries(W).map(([k, v]) => [k, new Set(v.split(" "))]));
const SPECIAL_CHART = { de: /[ßäöü]/i, es: /[ñ¿¡áéíóú]/i, pt: /[ãõâêôç]/i, tr: /[ışğİ]/i, fr: /[èêàçœù]/i, it: /[àèìòù]/i };
const SPECIAL_SONGS = { de: /[ßäöü]/i, es: /[ñ¿¡]/i, pt: /[ãõ]|ção/i, tr: /[ışğİ]/i, fr: /[èœù]|ç[aou]/i, it: /[ìò]/i };

function tscore(titles, special) {
  const sc = Object.fromEntries(Object.keys(WS).map(k => [k, 0]));
  for (const t of titles) {
    const words = t.toLowerCase().replace(/\(.*?\)|\[.*?\]|\s-\s.*$/g, " ").split(/[^\p{L}']+/u).filter(Boolean);
    for (const k in WS) { let h = 0; for (const w of words) if (WS[k].has(w)) h++; sc[k] += Math.min(h, 2); }
    for (const k in special) if (special[k].test(t)) sc[k] += 1.5;
  }
  return sc;
}

const KPOP = new Set(["bts","blackpink","twice","stray kids","lisa","jennie","rosé","jung kook","newjeans","aespa","le sserafim","illit","enhypen","j-hope","seventeen","ateez","tomorrow x together","ive","itzy","(g)i-dle","i-dle","nct dream","nct 127","exo","red velvet","jimin","v","agust d","suga","jin","rm","babymonster","bigbang","psy","zico","iu","taeyang","g-dragon","jisoo","stayc","nmixx","kiss of life","riize","boynextdoor","zerobaseone","treasure","&team","tws","meovv","izna","hearts2hearts","cortis","all day project","yena","a2o"]);

// Manuelle Korrekturen für Grenzfälle
const OVERRIDES = {"Luciano":"de","Stromae":"fr","Lazza":"it","Mahmood":"it","Tony Effe":"it","Night Skinny":"it","Lil Kleine":"xx","Boef":"xx","Mc Menor Rf":"pt","MC Menor JP":"pt","MC YOSHI":"pt","Shashwat Sachdev":"xx","Daler Mehndi":"xx","Disney":"xx","Parcels":"en","Kavinsky":"en","rusowsky":"es","Gibran Alcocer":"xx","Stryv":"en","QMIIR":"en","Chill77":"en","Jazeek":"de","Céline Dion":"en","Ryuichi Sakamoto":"xx","Adam Levine":"en","elijah woods":"en","yung kai":"en","Dhruv":"en","MXZI":"xx","cape":"en","LiSA":"ja","NIKI":"en","Naomi Scott":"en","Sai Abhyankkar":"xx","Anirudh Ravichander":"xx","KATSEYE":"en"};

// Stufe 1: Chart-Verteilung + Titel aus den Länder-Charts
function classifyCharts(a) {
  const titles = [...a.titles]; if (!titles.length) return null;
  let kana = 0, hangul = 0;
  for (const t of titles) { if (/[぀-ヿ]/.test(t)) kana++; if (/[가-힯]/.test(t)) hangul++; }
  const sc = tscore(titles, SPECIAL_CHART);
  const gs = Object.fromEntries(Object.entries(G).map(([g, cs]) => [g, Math.max(0, ...cs.map(c => a.sh[c] || 0))]));
  const maxG = Math.max(...Object.values(gs)); if (maxG === 0) return null;
  const n = a.name.toLowerCase();
  if (KPOP.has(n)) return "ko";
  if (hangul / titles.length >= 0.2) return "ko";
  if (kana / titles.length >= 0.25) return "ja";
  const nonEn = Object.entries(sc).filter(([k]) => k !== "en").sort((x, y) => y[1] - x[1])[0];
  let l;
  if (nonEn[1] >= 2 && nonEn[1] > sc.en * 1.2 && gs[nonEn[0]] > 0) l = nonEn[0];
  else if (gs.en >= 0.3 * maxG || (sc.en >= 2 && sc.en > nonEn[1])) return "en";
  else {
    const best = Object.entries(gs).filter(([g]) => g !== "en").sort((x, y) => y[1] - x[1])[0][0];
    if (best === "ko" || best === "ja") return sc.en > 0 ? "en" : (best === "ja" && /[一-鿿]/.test(titles.join("")) ? "ja" : best);
    if (sc.en > 0 && sc.en >= nonEn[1]) return "en";
    l = best;
  }
  // Konzentration: echte lokale Künstler charten fast nur in ihrer Region
  let tot = 0; const gsum = {};
  for (const [g, cs] of Object.entries(G)) { gsum[g] = cs.reduce((s, c) => s + (a.sh[c] || 0), 0) / cs.length; tot += gsum[g]; }
  return gsum[l] / tot >= 0.3 ? l : "en";
}

// Stufe 2: mit der kompletten Songliste nachschärfen
function refineWithSongs(a) {
  let lang = a.lang;
  const titles = [...new Set(a.songs.slice(0, 80).map(s => s[0]))];
  const n = titles.length || 1;
  let kana = 0, hang = 0;
  for (const t of titles) { if (/[぀-ヿ]/.test(t)) kana++; if (/[가-힯]/.test(t)) hang++; }
  const sc = tscore(titles, SPECIAL_SONGS);
  const nonEn = Object.entries(sc).filter(([k]) => k !== "en").sort((x, y) => y[1] - x[1])[0];
  if (lang === "ko" || lang === "ja") { if (kana / n >= 0.15) return "ja"; if (hang / n >= 0.1) return "ko"; return lang; }
  if (kana / n >= 0.2) return "ja";
  if (hang / n >= 0.2) return "ko";
  if (lang === "en") return (nonEn[1] >= 4 && nonEn[1] >= sc.en * 1.5) ? nonEn[0] : "en";
  if (lang === "xx") return lang;
  if (sc.en >= 3 && sc.en >= sc[lang] * 2) return (nonEn[1] >= 4 && nonEn[1] >= sc.en * 1.5) ? nonEn[0] : "en";
  if (nonEn[0] !== lang && nonEn[1] >= 4 && nonEn[1] >= sc[lang] * 2) return nonEn[0];
  return lang;
}

/* ---------------- Ablauf ---------------- */
async function main() {
  const t0 = Date.now();
  const artists = {};
  for (const p of ["listeners.html", "listeners2.html", "listeners3.html"]) {
    const html = await get(p); if (!html) throw new Error("Konnte " + p + " nicht laden");
    for (const a of parseListeners(html)) artists[a.id] = { ...a, sh: {}, titles: new Set() };
  }
  console.log("Künstler (monatliche Hörer):", Object.keys(artists).length);
  if (Object.keys(artists).length < 5000) throw new Error("Zu wenige Künstler – hat sich kworb geändert?");

  for (const c of COUNTRIES) {
    const html = await get("country/" + c + "_weekly_totals.html"); if (!html) { console.warn("fehlt:", c); continue; }
    const per = {}; let sum = 0;
    for (const r of parseCountryTotals(html)) {
      per[r.id] = (per[r.id] || 0) + r.total; sum += r.total;
      if (artists[r.id] && r.title) artists[r.id].titles.add(r.title);
    }
    for (const id in per) if (artists[id]) artists[id].sh[c] = per[id] / sum;
  }

  for (const a of Object.values(artists)) a.lang = classifyCharts(a);
  const queue = Object.values(artists).filter(a => a.lang).sort((x, y) => y.listeners - x.listeners);
  console.log("Künstler mit Chartdaten:", queue.length);

  let i = 0, done = 0, failed = 0;
  async function worker() {
    while (i < queue.length) {
      const a = queue[i++];
      const html = await get("artist/" + a.id + "_songs.html");
      if (html) a.songs = parseSongs(html); else failed++;
      if (++done % 500 === 0) console.log("Songlisten:", done, "/", queue.length);
      await sleep(100);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log("Songlisten fertig, Fehler:", failed);
  if (failed > queue.length * 0.1) throw new Error("Zu viele fehlgeschlagene Abrufe");

  const norm = s => s.toLowerCase().replace(/\s*[\(\[][^\)\]]*[\)\]]/g, "").replace(/\s+-\s+.*$/, "")
    .replace(/\s+(feat\.?|ft\.?|with)\s+.*$/, "").replace(/[^\p{L}\p{N}]+/gu, "");
  const keep = ["de", "en", "es", "fr", "it", "pt", "ko", "ja", "tr"];
  const out = [];
  for (const a of queue) {
    if (!a.songs) continue;
    a.lang = refineWithSongs(a);
    if (OVERRIDES[a.name]) a.lang = OVERRIDES[a.name];
    if (!keep.includes(a.lang)) continue;
    const best = new Map();
    for (const [t, id, s] of a.songs) { const k = norm(t); if (!k || !id || !s) continue; if (!best.has(k) || best.get(k)[2] < s) best.set(k, [t, id, s]); }
    const songs = [...best.values()].sort((x, y) => y[2] - x[2]).slice(0, SONGS_PER_ARTIST);
    if (songs.length < 8) continue;
    out.push([a.name, a.id, a.listeners, a.lang, songs]);
  }
  out.sort((x, y) => y[2] - x[2]);
  if (out.length < 2000) throw new Error("Nur " + out.length + " Künstler – Datei wird nicht überschrieben");

  const data = { generated: new Date().toISOString().slice(0, 10), source: "kworb.net (Spotify)", artists: out };
  writeFileSync(OUT, "window.TOPTRACK_DATA=" + JSON.stringify(data) + ";\n");
  const cnt = {}; for (const a of out) cnt[a[3]] = (cnt[a[3]] || 0) + 1;
  console.log("Fertig:", out.length, "Künstler", JSON.stringify(cnt), "in", Math.round((Date.now() - t0) / 1000), "s");
}

main().catch(e => { console.error(e); process.exit(1); });
