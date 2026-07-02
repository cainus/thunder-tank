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
          <UrbanPreview width={map.width} height={map.height} />
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

function UrbanPreview({ width, height }: { width: number; height: number }) {
  const roadInsetX = Math.max(180, Math.round(width * 0.2));
  const roadInsetY = Math.max(180, Math.round(height * 0.2));
  const roadWidth = width - roadInsetX * 2;
  const roadHeight = height - roadInsetY * 2;
  const crosswalkBars = Array.from({ length: 9 }, (_, index) => (index - 4) * 32);
  const buildings = [
    { x: 110, y: 120, width: roadInsetX - 180, height: roadInsetY - 170, fill: "#8b775f" },
    { x: width - roadInsetX + 60, y: 120, width: roadInsetX - 180, height: roadInsetY - 170, fill: "#6e7b86" },
    { x: 110, y: height - roadInsetY + 60, width: roadInsetX - 180, height: roadInsetY - 170, fill: "#7b6f82" },
    { x: width - roadInsetX + 60, y: height - roadInsetY + 60, width: roadInsetX - 180, height: roadInsetY - 170, fill: "#7f6958" },
  ].filter((building) => building.width > 40 && building.height > 40);
  const trees = [
    { x: roadInsetX * 0.55, y: roadInsetY * 0.58 },
    { x: width - roadInsetX * 0.55, y: roadInsetY * 0.58 },
    { x: roadInsetX * 0.55, y: height - roadInsetY * 0.58 },
    { x: width - roadInsetX * 0.55, y: height - roadInsetY * 0.58 },
    { x: width / 2, y: roadInsetY * 0.46 },
    { x: width / 2, y: height - roadInsetY * 0.46 },
    { x: roadInsetX * 0.42, y: height / 2 },
    { x: width - roadInsetX * 0.42, y: height / 2 },
  ];
  const parkedCars = [
    { x: width / 2 - 180, y: roadInsetY - 74, fill: "#c94a3f", rotation: 0 },
    { x: width / 2 + 180, y: roadInsetY - 74, fill: "#4e89d8", rotation: 0 },
    { x: width / 2 - 180, y: roadInsetY + roadHeight + 74, fill: "#d7a53d", rotation: 0 },
    { x: width / 2 + 180, y: roadInsetY + roadHeight + 74, fill: "#8f5fd1", rotation: 0 },
    { x: roadInsetX - 74, y: height / 2 - 180, fill: "#3ca7a2", rotation: 90 },
    { x: roadInsetX - 74, y: height / 2 + 180, fill: "#bb5252", rotation: 90 },
    { x: roadInsetX + roadWidth + 74, y: height / 2 - 180, fill: "#9babb7", rotation: 90 },
    { x: roadInsetX + roadWidth + 74, y: height / 2 + 180, fill: "#50565d", rotation: 90 },
  ];

  return (
    <g aria-hidden="true">
      <rect x="0" y="0" width={width} height={height} fill="#596166" />
      <rect x={roadInsetX} y={roadInsetY} width={roadWidth} height={roadHeight} fill="#2d3136" />
      <rect x={roadInsetX - 34} y={roadInsetY - 34} width={roadWidth + 68} height="34" fill="#72787d" />
      <rect x={roadInsetX - 34} y={roadInsetY + roadHeight} width={roadWidth + 68} height="34" fill="#72787d" />
      <rect x={roadInsetX - 34} y={roadInsetY} width="34" height={roadHeight} fill="#72787d" />
      <rect x={roadInsetX + roadWidth} y={roadInsetY} width="34" height={roadHeight} fill="#72787d" />
      <rect x={roadInsetX - 34} y={roadInsetY - 34} width={roadWidth + 68} height={roadHeight + 68} fill="none" stroke="#c7cbd0" strokeWidth="6" opacity="0.9" />

      <line x1={roadInsetX + 40} y1={height / 2} x2={roadInsetX + roadWidth - 40} y2={height / 2} stroke="#f0df85" strokeWidth="8" strokeDasharray="90 62" opacity="0.85" />
      <line x1={width / 2} y1={roadInsetY + 40} x2={width / 2} y2={roadInsetY + roadHeight - 40} stroke="#f0df85" strokeWidth="8" strokeDasharray="90 62" opacity="0.85" />

      {crosswalkBars.map((offset) => (
        <g key={`cross-${offset}`}>
          <rect x={width / 2 - 48} y={roadInsetY - 30 + offset} width="96" height="18" fill="#e7e8ea" opacity="0.9" />
          <rect x={width / 2 - 48} y={roadInsetY + roadHeight + 12 + offset} width="96" height="18" fill="#e7e8ea" opacity="0.9" />
          <rect x={roadInsetX - 30 + offset} y={height / 2 - 48} width="18" height="96" fill="#e7e8ea" opacity="0.9" />
          <rect x={roadInsetX + roadWidth + 12 + offset} y={height / 2 - 48} width="18" height="96" fill="#e7e8ea" opacity="0.9" />
        </g>
      ))}

      {buildings.map((building, index) => (
        <g key={`building-${index}`}>
          <rect x={building.x} y={building.y} width={building.width} height={building.height} fill={building.fill} stroke="#2b2f33" strokeWidth="4" opacity="0.98" />
          {Array.from({ length: Math.max(2, Math.floor(building.width / 70)) }, (_, column) =>
            Array.from({ length: Math.max(2, Math.floor(building.height / 60)) }, (_, row) => (
              <rect
                key={`${index}-${column}-${row}`}
                x={building.x + (building.width / (Math.max(2, Math.floor(building.width / 70)) + 1)) * (column + 1) - 8}
                y={building.y + (building.height / (Math.max(2, Math.floor(building.height / 60)) + 1)) * (row + 1) - 11}
                width="16"
                height="22"
                fill="#cdd6db"
                opacity="0.68"
              />
            )),
          )}
        </g>
      ))}

      <rect x={width / 2 - (roadWidth * 0.18) / 2} y={height / 2 - (roadHeight * 0.18) / 2} width={roadWidth * 0.18} height={roadHeight * 0.18} fill="#666d72" opacity="0.65" stroke="#8d959b" strokeWidth="4" />

      {trees.map((tree, index) => (
        <g key={`tree-${index}`}>
          <rect x={tree.x - 6} y={tree.y - 1} width="12" height="26" fill="#6b4e34" opacity="0.95" />
          <circle cx={tree.x} cy={tree.y - 8} r="24" fill="#3d7b45" opacity="0.95" />
          <circle cx={tree.x - 12} cy={tree.y - 2} r="16" fill="#4d9455" opacity="0.9" />
          <circle cx={tree.x + 12} cy={tree.y - 2} r="16" fill="#4d9455" opacity="0.9" />
        </g>
      ))}

      {parkedCars.map((car, index) => (
        <g key={`car-${index}`} transform={`rotate(${car.rotation} ${car.x} ${car.y})`}>
          <rect x={car.x - 32} y={car.y - 15} width="64" height="30" rx="10" fill={car.fill} opacity="0.96" stroke="#1c1f22" strokeWidth="3" />
          <rect x={car.x - 13} y={car.y - 9} width="26" height="18" rx="5" fill="#cfe3f7" opacity="0.85" />
        </g>
      ))}
    </g>
  );
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
