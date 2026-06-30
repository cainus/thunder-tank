const EXPLOSION_CANDIDATES = [
  {
    label: "01 Explosion 1",
    path: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_01.ogg",
    source: "phoenix1291",
  },
  {
    label: "02 Explosion 2",
    path: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_02.ogg",
    source: "phoenix1291",
  },
  {
    label: "03 Explosion 3",
    path: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_03.ogg",
    source: "phoenix1291",
  },
  {
    label: "04 Explosion 4",
    path: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_04.ogg",
    source: "phoenix1291",
  },
  {
    label: "05 Explosion 5",
    path: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_05.ogg",
    source: "phoenix1291",
  },
  {
    label: "06 Explosion 6",
    path: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_06.ogg",
    source: "phoenix1291",
  },
  {
    label: "07 Explosion 7",
    path: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_07.ogg",
    source: "phoenix1291",
  },
  {
    label: "08 Explosion 8",
    path: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_08.ogg",
    source: "phoenix1291",
  },
  {
    label: "09 Explosion 9",
    path: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_09.ogg",
    source: "phoenix1291",
  },
  {
    label: "10 Explosion 10",
    path: "/assets/opengameart/sfx-pack-2-phoenix1291/explosion_10.ogg",
    source: "phoenix1291",
  },
  { label: "11 explosion1", path: "/assets/opengameart/explosions-ezduzziteh/explosion1.ogg", source: "EZduzziteh" },
  { label: "12 explosion2", path: "/assets/opengameart/explosions-ezduzziteh/explosion2.ogg", source: "EZduzziteh" },
  { label: "13 explosion3", path: "/assets/opengameart/explosions-ezduzziteh/explosion3.ogg", source: "EZduzziteh" },
  { label: "14 explosions4", path: "/assets/opengameart/explosions-ezduzziteh/explosions4.ogg", source: "EZduzziteh" },
  { label: "15 cannon_01", path: "/assets/opengameart/bang-firework-rubberduck/cannon_01.ogg", source: "rubberduck" },
  { label: "16 cannon_02", path: "/assets/opengameart/bang-firework-rubberduck/cannon_02.ogg", source: "rubberduck" },
  { label: "17 cannon_03", path: "/assets/opengameart/bang-firework-rubberduck/cannon_03.ogg", source: "rubberduck" },
  { label: "18 bang_01", path: "/assets/opengameart/bang-firework-rubberduck/bang_01.ogg", source: "rubberduck" },
  { label: "19 bang_04", path: "/assets/opengameart/bang-firework-rubberduck/bang_04.ogg", source: "rubberduck" },
  { label: "20 bang_05", path: "/assets/opengameart/bang-firework-rubberduck/bang_05.ogg", source: "rubberduck" },
];

const MOTOR_CANDIDATES = [
  {
    label: "01 Heavy loop",
    path: "/assets/opengameart/motor-loops/engine_heavy_loop_2.ogg",
    source: "yd",
  },
  {
    label: "02 Heavy slow",
    path: "/assets/opengameart/motor-loops/engine_heavy_slow_loop_0.ogg",
    source: "yd",
  },
  {
    label: "03 Heavy average",
    path: "/assets/opengameart/motor-loops/engine_heavy_average_loop_0.ogg",
    source: "yd",
  },
  {
    label: "04 Heavy fast",
    path: "/assets/opengameart/motor-loops/engine_heavy_fast_loop_0.ogg",
    source: "yd",
  },
  {
    label: "05 Heavy loop alt",
    path: "/assets/opengameart/motor-loops/engine_heavy_loop_1.ogg",
    source: "yd",
  },
];

interface SoundAuditionProps {
  onClose: () => void;
  variant?: "explosions" | "motors";
}

export function SoundAudition({ onClose, variant = "explosions" }: SoundAuditionProps) {
  const isMotorPage = variant === "motors";
  const candidates = isMotorPage ? MOTOR_CANDIDATES : EXPLOSION_CANDIDATES;

  function playCandidate(candidate: (typeof candidates)[number]): void {
    const audio = new Audio(candidate.path);
    audio.volume = isMotorPage ? 0.55 : 0.85;
    audio.loop = isMotorPage;
    void audio.play();

    if (isMotorPage) {
      window.setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
      }, 3_000);
    }
  }

  return (
    <section className="sound-panel" aria-live="polite">
      <p className="eyebrow">{isMotorPage ? "Motor Sounds" : "Explosion Sounds"}</p>
      <h1>Audition</h1>
      <p className="menu-copy">
        {isMotorPage
          ? "Try these CC0 OpenGameArt heavy vehicle engine loops. Each preview stops after 3 seconds. Tell me the number or filename you want for moving tanks."
          : "Try these 20 CC0 OpenGameArt explosion, bang, and cannon clips. Tell me the numbers or filenames that feel closest."}
      </p>
      <div className="sound-grid">
        {candidates.map((candidate) => (
          <button
            key={candidate.label}
            type="button"
            className="sound-option"
            onClick={() => playCandidate(candidate)}
          >
            <span>{candidate.label}</span>
            <strong>{decodeURIComponent(candidate.path.split("/").at(-1) ?? "")}</strong>
            <em>{candidate.source}</em>
          </button>
        ))}
      </div>
      <div className="setup-actions">
        <button type="button" className="secondary-button" onClick={onClose}>
          Close
        </button>
      </div>
    </section>
  );
}
