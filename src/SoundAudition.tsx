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

interface SoundAuditionProps {
  onClose: () => void;
}

export function SoundAudition({ onClose }: SoundAuditionProps) {
  function playCandidate(candidate: (typeof EXPLOSION_CANDIDATES)[number]): void {
    const audio = new Audio(candidate.path);
    audio.volume = 0.85;
    void audio.play();
  }

  return (
    <section className="sound-panel" aria-live="polite">
      <p className="eyebrow">Explosion Sounds</p>
      <h1>Audition</h1>
      <p className="menu-copy">Try these 20 CC0 OpenGameArt explosion, bang, and cannon clips. Tell me the numbers or filenames that feel closest.</p>
      <div className="sound-grid">
        {EXPLOSION_CANDIDATES.map((candidate) => (
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
