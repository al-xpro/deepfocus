// Runs inline in <head>, before the first paint: colors the loading panel for
// the visitor's time (the custom hour they chose, or their clock), so it opens
// already matching the sky it's about to reveal. Self-contained, no imports: it's
// serialized into the page as a string.

function setLoaderTone() {
  try {
    let hour = -1;
    try {
      const saved = localStorage.getItem("deepfocus:time");
      if (saved !== null && isFinite(Number(saved)) && Number(saved) >= 0 && Number(saved) < 24) hour = Number(saved);
    } catch {}
    if (hour < 0) {
      const now = new Date();
      hour = now.getHours() + now.getMinutes() / 60;
    }
    // [hour, sky at the top, sea at the bottom]: soft, calm versions of the scene's colors.
    const stops: Array<[number, string, string]> = [
      [0, "101a36", "060b18"],
      [4, "1a2244", "0a1022"],
      [5, "e6bba6", "56628a"],
      [6.5, "d2e3ee", "7c9cb8"],
      [12, "dcebf5", "7199bb"],
      [16.5, "e8e2da", "7d98b0"],
      [18, "edb79a", "5d5f86"],
      [19.5, "433f66", "151a33"],
      [21, "141c3a", "070c1b"],
      [24, "101a36", "060b18"],
    ];
    let i = 0;
    while (i < stops.length - 2 && hour >= stops[i + 1][0]) i++;
    const a = stops[i];
    const b = stops[i + 1];
    const t = (hour - a[0]) / (b[0] - a[0]);
    const mix = function (x: string, y: string, k: number) {
      let out = "#";
      for (let c = 0; c < 3; c++) {
        const v = Math.round(parseInt(x.substr(c * 2, 2), 16) * (1 - k) + parseInt(y.substr(c * 2, 2), 16) * k);
        out += ("0" + v.toString(16)).slice(-2);
      }
      return out;
    };
    const lum = function (hex: string) {
      const w = [0.2126, 0.7152, 0.0722];
      let sum = 0;
      for (let c = 0; c < 3; c++) {
        const v = parseInt(hex.substr(1 + c * 2, 2), 16) / 255;
        sum += w[c] * (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
      }
      return sum;
    };
    const top = mix(a[1], b[1], t);
    const bottom = mix(a[2], b[2], t);
    // The text sits mid-screen: ink or white, whichever reads better there.
    const mid = lum(mix(top.slice(1), bottom.slice(1), 0.5));
    const text = (mid + 0.05) / 0.0526 > 1.05 / (mid + 0.05) ? "#03070f" : "#ffffff";
    const style = document.documentElement.style;
    style.setProperty("--loader-top", top);
    style.setProperty("--loader-bottom", bottom);
    style.setProperty("--loader-text", text);
  } catch {}
}

export const loaderToneScript = `(${setLoaderTone.toString()})();`;
