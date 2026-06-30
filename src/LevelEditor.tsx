import { useEffect, useMemo, useState } from "react";
import {
  EDITOR_ENEMY_ARCHETYPES,
  EDITOR_OBSTACLE_KINDS,
  EDITOR_PICKUP_TYPES,
  createBlankCustomMap,
  customMapToCampaignMap,
  makeObjectId,
  validateCustomMap,
  type CustomMapData,
  type CustomMapValidationMode,
  type EditableEnemyArchetype,
  type EditableObstacleKind,
  type EditablePickupType,
} from "./game/map-schema";
import type { CampaignMap } from "./game/types";

type EditorTool =
  | { kind: "select"; label: string }
  | { kind: "obstacle"; label: string; obstacle: EditableObstacleKind }
  | { kind: "pickup"; label: string; pickup: EditablePickupType }
  | { kind: "enemySpawn"; label: string; archetype: EditableEnemyArchetype }
  | { kind: "playerSpawn"; label: string }
  | { kind: "playerTwoSpawn"; label: string }
  | { kind: "coOpDriverSpawn"; label: string }
  | { kind: "coOpGunnerSpawn"; label: string };

interface LevelEditorProps {
  onClose: () => void;
  onTestPlay: (map: CampaignMap) => void;
}

interface MapSummary {
  id: string;
  title: string;
  authorLabel: string;
  updatedAt: string;
}

interface MapRecord extends MapSummary {
  mapData: CustomMapData;
}

const STORAGE_KEY = "thunder-tank.editorDrafts.v1";
const GRID_SIZE = 40;
const ANGLE_SNAP_DEGREES = 15;
const TOOLS: EditorTool[] = [
  { kind: "select", label: "Select" },
  ...EDITOR_OBSTACLE_KINDS.map((obstacle) => ({ kind: "obstacle" as const, label: obstacle, obstacle })),
  ...EDITOR_PICKUP_TYPES.map((pickup) => ({ kind: "pickup" as const, label: pickup, pickup })),
  ...EDITOR_ENEMY_ARCHETYPES.map((archetype) => ({
    kind: "enemySpawn" as const,
    label: `${archetype} enemy`,
    archetype,
  })),
  { kind: "playerSpawn", label: "P1 spawn" },
  { kind: "playerTwoSpawn", label: "P2 spawn" },
  { kind: "coOpDriverSpawn", label: "Co-op driver" },
  { kind: "coOpGunnerSpawn", label: "Co-op gunner" },
];

export function LevelEditor({ onClose, onTestPlay }: LevelEditorProps) {
  const [map, setMap] = useState<CustomMapData>(() => loadFirstDraft() ?? createBlankCustomMap());
  const [selectedId, setSelectedId] = useState(map.playerSpawn.id);
  const [tool, setTool] = useState<EditorTool>(TOOLS[0]);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [validationMode, setValidationMode] = useState<CustomMapValidationMode>("onePlayer");
  const [message, setMessage] = useState("");
  const [libraryMaps, setLibraryMaps] = useState<MapSummary[]>([]);
  const [localRevision, setLocalRevision] = useState(0);
  const [pastMaps, setPastMaps] = useState<CustomMapData[]>([]);
  const [futureMaps, setFutureMaps] = useState<CustomMapData[]>([]);
  const validation = useMemo(() => validateCustomMap(map, validationMode), [map, validationMode]);
  const drafts = useMemo(() => loadDrafts(), [localRevision]);
  const selected = getEditableObject(map, selectedId);

  useEffect(() => {
    void refreshLibrary();
  }, []);

  function updateMap(updater: (current: CustomMapData) => CustomMapData): void {
    setMap((current) => {
      const next = updater(current);

      if (next === current) {
        return current;
      }

      setPastMaps((past) => [...past.slice(-49), current]);
      setFutureMaps([]);
      return next;
    });
  }

  function undo(): void {
    setPastMaps((past) => {
      const previous = past.at(-1);

      if (!previous) {
        return past;
      }

      setFutureMaps((future) => [map, ...future.slice(0, 49)]);
      setMap(previous);
      setSelectedId(previous.playerSpawn.id);
      return past.slice(0, -1);
    });
  }

  function redo(): void {
    setFutureMaps((future) => {
      const next = future[0];

      if (!next) {
        return future;
      }

      setPastMaps((past) => [...past.slice(-49), map]);
      setMap(next);
      setSelectedId(next.playerSpawn.id);
      return future.slice(1);
    });
  }

  function handleCanvasPointer(event: React.PointerEvent<SVGSVGElement>): void {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const point = {
      x: ((event.clientX - rect.left) / rect.width) * map.width,
      y: ((event.clientY - rect.top) / rect.height) * map.height,
    };
    const position = snapToGrid ? snapPoint(point) : point;

    if (tool.kind === "select") {
      return;
    }

    placeTool(position);
  }

  function placeTool(position: { x: number; y: number }): void {
    const ids = collectIds(map);

    if (tool.kind === "obstacle") {
      const id = makeObjectId(tool.obstacle, ids);
      updateMap((current) => ({
        ...current,
        obstacles: [...current.obstacles, { id, x: position.x, y: position.y, kind: tool.obstacle, rotation: 0 }],
      }));
      setSelectedId(id);
      return;
    }

    if (tool.kind === "pickup") {
      const id = makeObjectId(`pickup-${tool.pickup}`, ids);
      updateMap((current) => ({
        ...current,
        pickups: [...current.pickups, { id, x: position.x, y: position.y, type: tool.pickup }],
      }));
      setSelectedId(id);
      return;
    }

    if (tool.kind === "enemySpawn") {
      const id = makeObjectId(`enemy-${tool.archetype}`, ids);
      updateMap((current) => ({
        ...current,
        enemySpawns: [...current.enemySpawns, { id, x: position.x, y: position.y, archetype: tool.archetype }],
      }));
      setSelectedId(id);
      return;
    }

    const id = `${tool.kind}`;
    const spawn = { id, x: position.x, y: position.y };
    updateMap((current) => ({
      ...current,
      ...(tool.kind === "playerSpawn" ? { playerSpawn: { ...spawn, id: "player-spawn" } } : {}),
      ...(tool.kind === "playerTwoSpawn" ? { playerTwoSpawn: { ...spawn, id: "player-two-spawn" } } : {}),
      ...(tool.kind === "coOpDriverSpawn" ? { coOpDriverSpawn: { ...spawn, id: "coop-driver-spawn" } } : {}),
      ...(tool.kind === "coOpGunnerSpawn" ? { coOpGunnerSpawn: { ...spawn, id: "coop-gunner-spawn" } } : {}),
    }));
    setSelectedId(
      tool.kind === "playerSpawn"
        ? "player-spawn"
        : tool.kind === "playerTwoSpawn"
          ? "player-two-spawn"
          : tool.kind === "coOpDriverSpawn"
            ? "coop-driver-spawn"
            : "coop-gunner-spawn",
    );
  }

  function updateSelected(field: "x" | "y" | "rotation", value: number): void {
    const nextValue = field === "rotation" && snapToGrid ? snapAngle(value) : value;
    updateMap((current) => updateObject(current, selectedId, field, nextValue));
  }

  function duplicateSelected(): void {
    const object = getEditableObject(map, selectedId);

    if (!object || object.type === "spawn") {
      return;
    }

    const id = makeObjectId(object.kind, collectIds(map));

    if (object.type === "obstacle") {
      updateMap((current) => ({
        ...current,
        obstacles: [...current.obstacles, { ...object.value, id, x: object.value.x + GRID_SIZE, y: object.value.y + GRID_SIZE }],
      }));
    } else if (object.type === "pickup") {
      updateMap((current) => ({
        ...current,
        pickups: [...current.pickups, { ...object.value, id, x: object.value.x + GRID_SIZE, y: object.value.y + GRID_SIZE }],
      }));
    } else {
      updateMap((current) => ({
        ...current,
        enemySpawns: [...current.enemySpawns, { ...object.value, id, x: object.value.x + GRID_SIZE, y: object.value.y + GRID_SIZE }],
      }));
    }

    setSelectedId(id);
  }

  function deleteSelected(): void {
    updateMap((current) => ({
      ...current,
      enemySpawns: current.enemySpawns.length > 1 ? current.enemySpawns.filter((spawn) => spawn.id !== selectedId) : current.enemySpawns,
      obstacles: current.obstacles.filter((obstacle) => obstacle.id !== selectedId),
      pickups: current.pickups.filter((pickup) => pickup.id !== selectedId),
    }));
  }

  async function saveMap(): Promise<void> {
    const result = validateCustomMap(map, validationMode);

    if (!result.success || !result.data) {
      setMessage("Fix validation errors before saving.");
      return;
    }

    try {
      const response = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result.data),
      });

      if (!response.ok) {
        throw new Error(`Save failed with HTTP ${response.status}`);
      }

      await refreshLibrary();
      saveLocalDraft(result.data);
      setMessage(`Saved ${result.data.title} to the map library.`);
      return;
    } catch {
      saveLocalDraft(result.data);
      setMessage(`Saved ${result.data.title} locally. Start the API to persist it to Postgres.`);
    }
  }

  function saveLocalDraft(nextMap: CustomMapData): void {
    const next = { ...loadDrafts(), [map.id]: map };
    next[nextMap.id] = nextMap;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setLocalRevision((revision) => revision + 1);
  }

  async function loadLibraryMap(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/maps/${encodeURIComponent(id)}`);

      if (!response.ok) {
        throw new Error(`Load failed with HTTP ${response.status}`);
      }

      const record = (await response.json()) as MapRecord;
      loadMap(record.mapData, `Loaded ${record.mapData.title} from the map library.`);
      return;
    } catch {
      loadDraft(id);
    }
  }

  function loadDraft(id: string): void {
    const draft = loadDrafts()[id];

    if (draft) {
      loadMap(draft, `Loaded ${draft.title} from local drafts.`);
    }
  }

  async function deleteMap(id: string): Promise<void> {
    try {
      const response = await fetch(`/api/maps/${encodeURIComponent(id)}`, { method: "DELETE" });

      if (!response.ok && response.status !== 404) {
        throw new Error(`Delete failed with HTTP ${response.status}`);
      }

      await refreshLibrary();
    } catch {
      // Local fallback still lets the editor remain useful without the API process.
    }

    deleteLocalDraft(id);
    setMessage(`Deleted ${id}.`);
  }

  function deleteLocalDraft(id: string): void {
    const next = { ...loadDrafts() };
    delete next[id];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setLocalRevision((revision) => revision + 1);
  }

  function loadMap(nextMap: CustomMapData, nextMessage: string): void {
    setMap(nextMap);
    setSelectedId(nextMap.playerSpawn.id);
    setPastMaps([]);
    setFutureMaps([]);
    setMessage(nextMessage);
  }

  async function refreshLibrary(): Promise<void> {
    try {
      const response = await fetch("/api/maps");

      if (!response.ok) {
        throw new Error(`List failed with HTTP ${response.status}`);
      }

      const data = (await response.json()) as { maps: MapSummary[] };
      setLibraryMaps(data.maps);
    } catch {
      setLibraryMaps([]);
    }
  }

  function testPlay(): void {
    const result = validateCustomMap(map, "onePlayer");

    if (!result.success || !result.data) {
      setMessage("Fix validation errors before test play.");
      return;
    }

    onTestPlay(customMapToCampaignMap(result.data));
  }

  return (
    <section className="editor-panel" aria-live="polite">
      <div className="editor-header">
        <div>
          <p className="eyebrow">Level Editor</p>
          <h1>Map Lab</h1>
        </div>
        <div className="editor-header-actions">
          <button type="button" onClick={testPlay} disabled={!validation.success}>
            Test Play
          </button>
          <button type="button" className="secondary-button" onClick={saveMap}>
            Save Map
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="editor-shell">
        <aside className="editor-sidebar" aria-label="Editor tools">
          <label>
            Title
            <input value={map.title} onChange={(event) => updateMap((current) => ({ ...current, title: event.target.value }))} />
          </label>
          <label>
            Map ID
            <input value={map.id} onChange={(event) => updateMap((current) => ({ ...current, id: event.target.value }))} />
          </label>
          <div className="editor-two-col">
            <label>
              Width
              <input type="number" value={map.width} onChange={(event) => updateMap((current) => ({ ...current, width: Number(event.target.value) }))} />
            </label>
            <label>
              Height
              <input type="number" value={map.height} onChange={(event) => updateMap((current) => ({ ...current, height: Number(event.target.value) }))} />
            </label>
          </div>
          <label className="editor-toggle">
            <input type="checkbox" checked={snapToGrid} onChange={(event) => setSnapToGrid(event.target.checked)} />
            Grid and angle snap
          </label>
          <div className="editor-header-actions">
            <button type="button" className="secondary-button" onClick={undo} disabled={pastMaps.length === 0}>
              Undo
            </button>
            <button type="button" className="secondary-button" onClick={redo} disabled={futureMaps.length === 0}>
              Redo
            </button>
          </div>
          <label>
            Validate for
            <select value={validationMode} onChange={(event) => setValidationMode(event.target.value as CustomMapValidationMode)}>
              <option value="onePlayer">1P</option>
              <option value="twoPlayer">2P</option>
              <option value="coOp">Co-op</option>
            </select>
          </label>
          <div className="editor-tool-grid">
            {TOOLS.map((nextTool) => (
              <button
                key={nextTool.label}
                type="button"
                className={tool.label === nextTool.label ? "editor-tool is-selected" : "editor-tool"}
                onClick={() => setTool(nextTool)}
              >
                {nextTool.label}
              </button>
            ))}
          </div>
        </aside>

        <svg
          className="editor-canvas"
          role="img"
          aria-label="Map editor canvas"
          viewBox={`0 0 ${map.width} ${map.height}`}
          onPointerDown={handleCanvasPointer}
        >
          <rect x="0" y="0" width={map.width} height={map.height} fill="#263326" />
          <Grid width={map.width} height={map.height} />
          {map.obstacles.map((obstacle) => (
            <rect
              key={obstacle.id}
              className={selectedId === obstacle.id ? "editor-object is-selected" : "editor-object"}
              x={obstacle.x - 34}
              y={obstacle.y - 34}
              width="68"
              height="68"
              rx="5"
              transform={`rotate(${obstacle.rotation} ${obstacle.x} ${obstacle.y})`}
              fill={obstacle.kind === "barrel" ? "#bb3e30" : obstacle.kind === "sandbag" ? "#d8c68c" : "#8ea0a4"}
              onPointerDown={(event) => {
                event.stopPropagation();
                setTool(TOOLS[0]);
                setSelectedId(obstacle.id);
              }}
            />
          ))}
          {map.pickups.map((pickup) => (
            <circle
              key={pickup.id}
              className={selectedId === pickup.id ? "editor-object is-selected" : "editor-object"}
              cx={pickup.x}
              cy={pickup.y}
              r="28"
              fill={pickup.type === "speed" ? "#5dbb63" : pickup.type === "rapidFire" ? "#e7cc79" : "#64a7d8"}
              onPointerDown={(event) => {
                event.stopPropagation();
                setTool(TOOLS[0]);
                setSelectedId(pickup.id);
              }}
            />
          ))}
          {[map.playerSpawn, map.playerTwoSpawn, map.coOpDriverSpawn, map.coOpGunnerSpawn].filter(Boolean).map((spawn) => (
            <SpawnMarker key={spawn!.id} spawn={spawn!} selected={selectedId === spawn!.id} setSelectedId={setSelectedId} label={spawn!.id.includes("two") ? "P2" : spawn!.id.includes("coop") ? "CO" : "P1"} />
          ))}
          {map.enemySpawns.map((spawn) => (
            <SpawnMarker key={spawn.id} spawn={spawn} selected={selectedId === spawn.id} setSelectedId={setSelectedId} label={spawn.archetype[0].toUpperCase()} enemy />
          ))}
        </svg>

        <aside className="editor-sidebar" aria-label="Inspector and validation">
          <strong>Inspector</strong>
          {selected ? (
            <>
              <p className="editor-selected-id">{selected.id}</p>
              <div className="editor-two-col">
                <label>
                  X
                  <input type="number" value={Math.round(selected.x)} onChange={(event) => updateSelected("x", Number(event.target.value))} />
                </label>
                <label>
                  Y
                  <input type="number" value={Math.round(selected.y)} onChange={(event) => updateSelected("y", Number(event.target.value))} />
                </label>
              </div>
              {selected.type === "obstacle" && (
                <label>
                  Rotation
                  <input type="number" value={selected.rotation} onChange={(event) => updateSelected("rotation", Number(event.target.value))} />
                </label>
              )}
              <div className="editor-header-actions">
                <button type="button" className="secondary-button" onClick={duplicateSelected} disabled={selected.type === "spawn"}>
                  Duplicate
                </button>
                <button type="button" className="secondary-button" onClick={deleteSelected}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <p className="control-hint">Select an object on the canvas.</p>
          )}

          <strong>Validation</strong>
          <ul className={validation.success ? "editor-validation is-valid" : "editor-validation"}>
            {validation.messages.length === 0 ? (
              <li>Map is valid for {validationMode}.</li>
            ) : (
              validation.messages.map((validationMessage, index) => <li key={`${validationMessage.code}-${index}`}>{validationMessage.message}</li>)
            )}
          </ul>

          <strong>Map Library</strong>
          <div className="editor-draft-list">
            {libraryMaps.length === 0 ? (
              <span>No API maps loaded.</span>
            ) : (
              libraryMaps.map((libraryMap) => (
                <div key={libraryMap.id}>
                  <button type="button" className="secondary-button" onClick={() => loadLibraryMap(libraryMap.id)}>
                    {libraryMap.title}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => deleteMap(libraryMap.id)}>
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>

          <strong>Local Fallback</strong>
          <div className="editor-draft-list">
            {Object.values(drafts).length === 0 ? (
              <span>No local maps.</span>
            ) : (
              Object.values(drafts).map((draft) => (
                <div key={draft.id}>
                  <button type="button" className="secondary-button" onClick={() => loadLibraryMap(draft.id)}>
                    {draft.title}
                  </button>
                  <button type="button" className="secondary-button" onClick={() => deleteMap(draft.id)}>
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
          {message && <p className="setup-message">{message}</p>}
        </aside>
      </div>
    </section>
  );
}

function Grid({ width, height }: { width: number; height: number }) {
  const lines = [];

  for (let x = GRID_SIZE; x < width; x += GRID_SIZE) {
    lines.push(<line key={`x-${x}`} x1={x} y1="0" x2={x} y2={height} />);
  }

  for (let y = GRID_SIZE; y < height; y += GRID_SIZE) {
    lines.push(<line key={`y-${y}`} x1="0" y1={y} x2={width} y2={y} />);
  }

  return <g className="editor-grid">{lines}</g>;
}

function SpawnMarker({
  spawn,
  selected,
  setSelectedId,
  label,
  enemy = false,
}: {
  spawn: { id: string; x: number; y: number };
  selected: boolean;
  setSelectedId: (id: string) => void;
  label: string;
  enemy?: boolean;
}) {
  return (
    <g
      className={selected ? "editor-object is-selected" : "editor-object"}
      onPointerDown={(event) => {
        event.stopPropagation();
        setSelectedId(spawn.id);
      }}
    >
      <circle cx={spawn.x} cy={spawn.y} r="36" fill={enemy ? "#c94f40" : "#4da3d8"} />
      <text x={spawn.x} y={spawn.y + 9} textAnchor="middle" fontSize="28" fontWeight="800" fill="#15120b">
        {label}
      </text>
    </g>
  );
}

function snapPoint(point: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.round(point.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(point.y / GRID_SIZE) * GRID_SIZE,
  };
}

function snapAngle(value: number): number {
  return Math.round(value / ANGLE_SNAP_DEGREES) * ANGLE_SNAP_DEGREES;
}

function collectIds(map: CustomMapData): string[] {
  return [
    map.playerSpawn.id,
    map.playerTwoSpawn?.id,
    map.coOpDriverSpawn?.id,
    map.coOpGunnerSpawn?.id,
    ...map.enemySpawns.map((spawn) => spawn.id),
    ...map.obstacles.map((obstacle) => obstacle.id),
    ...map.pickups.map((pickup) => pickup.id),
  ].filter((id): id is string => Boolean(id));
}

function getEditableObject(map: CustomMapData, id: string):
  | { id: string; type: "spawn"; kind: string; x: number; y: number; value: { id: string; x: number; y: number } }
  | { id: string; type: "obstacle"; kind: string; x: number; y: number; rotation: number; value: CustomMapData["obstacles"][number] }
  | { id: string; type: "pickup"; kind: string; x: number; y: number; value: CustomMapData["pickups"][number] }
  | { id: string; type: "enemy"; kind: string; x: number; y: number; value: CustomMapData["enemySpawns"][number] }
  | undefined {
  const spawns = [map.playerSpawn, map.playerTwoSpawn, map.coOpDriverSpawn, map.coOpGunnerSpawn].filter(
    (spawn): spawn is { id: string; x: number; y: number } => Boolean(spawn),
  );
  const spawn = spawns.find((candidate) => candidate.id === id);

  if (spawn) {
    return { id: spawn.id, type: "spawn", kind: "spawn", x: spawn.x, y: spawn.y, value: spawn };
  }

  const obstacle = map.obstacles.find((candidate) => candidate.id === id);

  if (obstacle) {
    return { id: obstacle.id, type: "obstacle", kind: obstacle.kind, x: obstacle.x, y: obstacle.y, rotation: obstacle.rotation, value: obstacle };
  }

  const pickup = map.pickups.find((candidate) => candidate.id === id);

  if (pickup) {
    return { id: pickup.id, type: "pickup", kind: pickup.type, x: pickup.x, y: pickup.y, value: pickup };
  }

  const enemy = map.enemySpawns.find((candidate) => candidate.id === id);

  if (enemy) {
    return { id: enemy.id, type: "enemy", kind: enemy.archetype, x: enemy.x, y: enemy.y, value: enemy };
  }

  return undefined;
}

function updateObject(map: CustomMapData, id: string, field: "x" | "y" | "rotation", value: number): CustomMapData {
  const updatePosition = <T extends { id: string; x: number; y: number; rotation?: number }>(object: T): T =>
    object.id === id ? { ...object, [field]: value } : object;

  return {
    ...map,
    playerSpawn: updatePosition(map.playerSpawn),
    playerTwoSpawn: map.playerTwoSpawn ? updatePosition(map.playerTwoSpawn) : undefined,
    coOpDriverSpawn: map.coOpDriverSpawn ? updatePosition(map.coOpDriverSpawn) : undefined,
    coOpGunnerSpawn: map.coOpGunnerSpawn ? updatePosition(map.coOpGunnerSpawn) : undefined,
    enemySpawns: map.enemySpawns.map(updatePosition),
    obstacles: map.obstacles.map(updatePosition),
    pickups: map.pickups.map(updatePosition),
  };
}

function loadDrafts(): Record<string, CustomMapData> {
  if (typeof localStorage === "undefined") {
    return {};
  }

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, CustomMapData>;
  } catch {
    return {};
  }
}

function loadFirstDraft(): CustomMapData | undefined {
  return Object.values(loadDrafts())[0];
}
