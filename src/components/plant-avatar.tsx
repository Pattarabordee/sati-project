type PlantAvatarProps = {
  decorations: string[];
  state?: "normal" | "warning" | "action";
  stageIndex?: number;
  levelPulse?: boolean;
};

const decorationPositions = [
  [70, 120],
  [250, 120],
  [60, 210],
  [260, 210],
  [160, 90],
];

export function PlantAvatar({
  decorations,
  state = "normal",
  stageIndex = 0,
  levelPulse = false,
}: PlantAvatarProps) {
  const className = [
    "plant",
    `plant-${state}`,
    stageIndex >= 2 ? "plant-grown" : "",
    stageIndex >= 4 ? "plant-flourishing" : "",
    levelPulse ? "plant-level-pop" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg className={className} viewBox="0 0 320 340" role="img" aria-label="Sati plant growth avatar">
      <g className="plant-aura" aria-hidden="true">
        <circle className="aura-ring aura-ring-outer" cx="160" cy="176" r="112" />
        <circle className="aura-ring aura-ring-inner" cx="160" cy="176" r="76" />
        <circle className="aura-spark spark-one" cx="92" cy="126" r="4" />
        <circle className="aura-spark spark-two" cx="230" cy="126" r="3.5" />
        <circle className="aura-spark spark-three" cx="204" cy="78" r="3" />
      </g>
      <ellipse className="plant-shadow" cx="160" cy="323" rx="74" ry="12" />
      <path className="pot-bg" d="M104 270 h112 l-12 52 a8 8 0 0 1 -8 6 h-64 a8 8 0 0 1 -8 -6 z" />
      <rect className="pot-top-bg" x="98" y="254" width="124" height="26" rx="10" />
      <rect className="stem stem-m stem-bg" x="155" y="158" width="10" height="104" rx="5" />
      <path className="leaf leaf-l leaf-bg" d="M158 236 C120 226 96 196 100 162 C134 168 158 196 158 236 Z" />
      <path className="leaf leaf-r leaf-bg" d="M162 236 C200 226 224 196 220 162 C186 168 162 196 162 236 Z" />
      <path className="leaf leaf-sl leaf-bg-light" d="M158 232 C134 230 116 210 116 186 C140 192 156 208 158 232 Z" opacity=".92" />
      <path className="leaf leaf-sr leaf-bg-light" d="M162 232 C186 230 204 210 204 186 C180 192 164 208 162 232 Z" opacity=".92" />
      <path className="leaf leaf-t leaf-bg-light" d="M160 196 C150 170 158 150 160 138 C172 150 170 174 160 196 Z" />
      <circle className="head head-bg" cx="160" cy="172" r="54" />
      <ellipse className="face-highlight" cx="146" cy="144" rx="30" ry="16" />
      <ellipse className="cheek cheek-bg" cx="128" cy="184" rx="10" ry="7" opacity=".5" />
      <ellipse className="cheek cheek-bg" cx="192" cy="184" rx="10" ry="7" opacity=".5" />
      <ellipse className="ink-bg" cx="144" cy="168" rx="7" ry="10" />
      <ellipse className="ink-bg" cx="176" cy="168" rx="7" ry="10" />
      <circle className="eye-shine" cx="141" cy="164" r="2.3" />
      <circle className="eye-shine" cx="173" cy="164" r="2.3" />
      <path className="brow brow-l ink-stroke" d="M134 154 C141 151 148 151 154 155" strokeWidth="3.2" fill="none" strokeLinecap="round" opacity="0" />
      <path className="brow brow-r ink-stroke" d="M166 155 C172 151 179 151 186 154" strokeWidth="3.2" fill="none" strokeLinecap="round" opacity="0" />
      <path className="mouth ink-stroke" d="M141 190 C151 206 172 206 181 190" strokeWidth="4" fill="none" strokeLinecap="round" />
      <path className="tear tear-bg" d="M196 182 c-5 8 -5 14 0 14 c5 0 5 -6 0 -14 z" opacity="0" />
      <g className="plant-charms" aria-hidden="true">
        {decorations.map((emoji, index) => {
          const [x, y] = decorationPositions[index % decorationPositions.length];
          return (
            <text className="plant-charm" key={`${emoji}-${index}`} x={x} y={y} fontSize="30" textAnchor="middle">
              {emoji}
            </text>
          );
        })}
      </g>
    </svg>
  );
}
