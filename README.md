# Roblox Forge AI

A local-first development workbench for Roblox creators. It combines working offline generators, an optional server-side OpenAI integration, project downloads, and a token-protected Roblox Studio transfer plugin.

## Requirements

- Node.js 20 or newer
- Roblox Studio for Studio transfer and in-game testing
- Optional: an OpenAI API key for prompt-specific AI generation

No npm packages are required.

## Run locally

```sh
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The server binds to loopback only. Without an API key, the local templates work immediately. To use AI, export the variables in the shell before starting Node; this project intentionally does not parse `.env` files or store secrets itself. `.env.example` documents the optional settings.

```sh
OPENAI_API_KEY="..." OPENAI_MODEL="gpt-4.1-mini" npm start
```

The key is read only by `src/server.mjs` and sent from the server to the provider. It is never embedded in frontend assets or returned to the browser. `.env*` is ignored by Git, but do not commit credentials.

## Features

- Luau, building, world, NPC, VFX, mesh workflow, complete game-system, and development-assistant workspaces.
- Local templates for common working systems, with generated files shown in an inspectable source panel.
- Optional server-side AI generation through the OpenAI Responses API. Select **AI provider** to require AI; **Auto** falls back to local templates if no key is configured.
- Download all generated files as a project ZIP or download/copy an individual source file.
- Studio Bridge localhost queue, token authentication, service-aware file insertion, and delivery acknowledgements.
- Responsive dark command-center interface with input validation and actionable errors.

Local asset generation uses Roblox Parts and Terrain. It does not create binary MeshParts, uploaded Roblox assets, or authored animation clips. Mesh generation includes a prototype and Studio import workflow; use Blender or another DCC tool for actual mesh authoring. Configure a server-side AI key for more prompt-specific Luau.

## Roblox Studio bridge setup

1. Keep the Forge server running and open **Studio Bridge** in the site. Copy the local token.
2. In Roblox Studio, create a Script in `ServerStorage`, paste the contents of `plugin/ForgeBridge.rbxm.lua` into it, select the Script, then choose **Plugins → Save as Local Plugin**. Delete the original ServerStorage Script after the plugin appears under `PluginDebugService`. This follows Roblox's [local plugin setup workflow](https://create.roblox.com/docs/studio/plugins).
3. In Studio, enable **Game Settings → Security → Allow HTTP Requests** for the place.
4. Open the **Forge Bridge** widget from the Forge AI toolbar. Keep the endpoint at `http://127.0.0.1:4173`, paste the token, then connect.
5. Generate a result in Forge, review the source, and click **Send to Studio**. The plugin creates or updates the destination scripts and acknowledges each file.

The bridge is designed for the local Studio process. If Roblox Studio cannot reach loopback on your machine, use the download ZIP workflow and import files through Studio's Explorer instead. Do not expose the bridge port to a public network.

## Local generation and Roblox setup notes

- **Game systems:** PvE combat checks target type, distance, health, and rate limits on the server. The game bundle also includes input, a coin HUD, a persistence example, inventory/quest modules, and a VehicleSeat ownership hook. The default quest module is an extension point; connect actual objectives and rewards in your server gameplay logic.
- **NPC:** The generated AI controls a rigged NPC Model if placed under one. When installed in ServerScriptService by the bridge, it creates a default R15 rig and runs pathfinding, detection, and melee behavior. Customize its appearance in Studio.
- **World:** The procedural terrain script fills its generated region. Adjust center, radius, seed, and density before running it in an existing place.
- **Building:** The script creates an editable anchored Part prototype. Adjust the generated geometry and materials in Studio.
- **Persistence:** Enable Studio API access for testing. Published experiences need DataStore access enabled. This sample saves a simple coin attribute; add retries, schema migration, and your complete profile data before production.
- **VFX:** The output is a ModuleScript function. Require it from trusted gameplay code and call `burst(position, color)`.

## Architecture

```text
src/server.mjs                 Loopback HTTP server, validation, AI API, Studio queue
src/generation/templates.mjs   Offline Luau and workflow generators
public/index.html              Command-center interface
public/styles.css              Responsive design system
public/app.js                  UI state, source review, ZIP export, bridge client
plugin/ForgeBridge.rbxm.lua    Roblox Studio transfer plugin source
```

The API accepts `POST /api/generate` with `{ mode, prompt, name, engine }`. Studio endpoints are under `/api/studio/*` and require the startup token. Prompts are limited to 5,000 characters and request bodies to 128 KB; generated Studio files are limited to 500 KB each.

## Checks

```sh
node --check src/server.mjs
node --check src/generation/templates.mjs
node --check public/app.js
npm start
```

Then open the command center, generate one result per mode using the **Surprise me** control, download a ZIP, and exercise Studio Bridge with the installed plugin. Roblox Luau execution and plugin behavior must be verified in Roblox Studio; this repository does not include a Roblox place file or a headless Roblox runtime.
