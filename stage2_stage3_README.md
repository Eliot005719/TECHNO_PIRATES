# Campus Sentinel — Stages 2 and 3

Run the browser prototype from the repository root:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`.

The application deliberately uses illustrative scene units. It does not consume the rejected Stage 1 metric geometry. `data/stage2/` stores portable visual-environment metadata, while `data/stage3/virtual_wifi_mesh.json` documents the simulated mesh; the matching runtime configuration lives under `src/data/`.

Implemented controls include campus/interior orbit, Building 410 entry, room selection, cutaway, ceiling/furniture visibility, mesh visibility, labels, links, scope, access-point selection, and access-point enable/disable. It intentionally excludes live Wi-Fi readings, RF propagation, sensing, and back-end integrations.
