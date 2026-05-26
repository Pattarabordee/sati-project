const pairs = [
  {
    pair: "text on bg",
    theme: "light",
    fg: "#2a3a30",
    bg: "#f4efe6",
    minimum: 4.5,
  },
  {
    pair: "text-soft on surface",
    theme: "light",
    fg: "#5a6861",
    bg: "#fbf8f1",
    minimum: 4.5,
  },
  {
    pair: "primary-fg on primary",
    theme: "light",
    fg: "#142019",
    bg: "#5fa896",
    minimum: 4.5,
  },
  {
    pair: "state-action text on bg",
    theme: "light",
    fg: "#8f4d44",
    bg: "#f4efe6",
    minimum: 4.5,
  },
  {
    pair: "text on bg",
    theme: "dark",
    fg: "#e8e4d8",
    bg: "#1a1f1d",
    minimum: 4.5,
  },
  {
    pair: "text-soft on surface",
    theme: "dark",
    fg: "#9aa39c",
    bg: "#232a28",
    minimum: 4.5,
  },
  {
    pair: "primary-fg on primary",
    theme: "dark",
    fg: "#1a1f1d",
    bg: "#7ec4ae",
    minimum: 4.5,
  },
];

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(clean.slice(index, index + 2), 16) / 255);
}

function linearize(channel) {
  return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(linearize);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

let hasFailure = false;
console.log("| Pair | Theme | Ratio | Minimum | Result |");
console.log("|---|---:|---:|---:|---|");

for (const item of pairs) {
  const ratio = contrastRatio(item.fg, item.bg);
  const pass = ratio >= item.minimum;
  hasFailure ||= !pass;
  console.log(
    `| ${item.pair} | ${item.theme} | ${ratio.toFixed(2)} | ${item.minimum.toFixed(1)} | ${pass ? "PASS" : "FAIL"} |`,
  );
}

if (hasFailure) {
  process.exitCode = 1;
}
