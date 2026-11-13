# Canvas AI Image Studio Design

## 1. Product goal

Build an open source desktop image creation and editing application for Windows and macOS. The product is a canvas-first workspace: users sketch, upload images, enter prompts, select areas, and apply AI operations directly on the canvas.

The application supports two model access modes:

- **Managed cloud**: the user signs in to the product service and spends account balance or credits.
- **User API key**: the desktop app calls supported image providers directly; credentials are stored in a local SQLite database in plaintext and can be viewed by the user.

The application does not run models locally, does not download model weights, and does not expose a node graph in the first release.

## 2. Product principles

1. **Canvas before configuration**: the user should be able to draw or upload an image before thinking about providers, model names, or advanced parameters.
2. **AI operations act on visible context**: an operation uses the current canvas, selected layer, selection, mask, reference images, and prompt.
3. **One action, one result set**: generate, inpaint, remove background, and upscale should return previewable variants that can be accepted, rejected, or sent back for another edit.
4. **Non-destructive history**: every AI request and canvas edit is recorded so the user can undo, compare, retry, and restore an earlier version.
5. **Provider independence**: the editor must not depend on one model vendor's request format.
6. **Simple default, expert details on demand**: model, seed, aspect ratio, and cost details remain available without dominating the main canvas.

## 3. User experience

### 3.1 Main workspace

The main window has four regions:

- **Tool rail**: select, move, brush, eraser, rectangle/ellipse selection, lasso, crop, text, and hand/pan.
- **Canvas**: layers, zoom, panning, guides, selection overlays, and before/after comparison.
- **Inspector**: prompt, negative prompt when supported, reference images, operation choice, model/provider, size, aspect ratio, strength, and generation count.
- **History tray**: recent operation results, variants, retry, compare, and restore actions.

### 3.2 Core actions

- **Sketch to image**: the user draws a rough sketch, enters a description, and generates one or more images guided by the sketch.
- **Text to image**: the user enters a prompt and generates images on a new layer or a new document.
- **Image to image**: the user selects an image and adjusts transformation strength and prompt.
- **Local edit / inpaint**: the user paints a mask or makes a selection, enters an edit instruction, and applies the result to the selected area.
- **Background removal**: the user applies background removal and receives a transparent layer or a new transparent image.
- **Upscale**: the user upscales the selected layer or image and chooses the output scale and quality mode.

These are direct canvas actions. They are not user-visible nodes.

### 3.3 Projects and history

A project stores:

- canvas size, color settings, and layer structure;
- raster layers and masks;
- prompts, provider choice, model, parameters, and operation timestamps;
- generated assets and their parent operation;
- a version history that can restore a prior state.

The first release should use a folder-based project format with a JSON manifest and an assets directory. The manifest must be versioned so future releases can migrate older projects.

Generated images are stored only in the local project folder or another local folder selected by the user. Final images are not synchronized to the managed cloud service by default.

## 4. Internal architecture

### 4.1 Desktop stack

- **Tauri 2** for the desktop shell and native capabilities.
- **React + TypeScript** for the UI and application state.
- **Konva** for the canvas, selections, masks, and layer interaction. Its scene graph and React integration are sufficient for the first release while keeping the editor's layer model under application control.
- **Rust commands** for filesystem access, native dialogs, SQLite file location, and controlled network/file operations.
- **TypeScript operation controller** for editor actions, request preparation, task polling, and result insertion.

The Rust side should remain small. Rendering, provider-specific request mapping, and editor behavior stay in TypeScript unless a native capability is required.

### 4.2 Operation model

The application uses an internal operation protocol rather than a node protocol. Each operation declares its inputs, provider capability, parameters, output assets, status, and cost metadata.

```ts
type ImageOperation = {
  id: string
  type: "text_to_image" | "sketch_to_image" | "image_to_image" |
    "inpaint" | "remove_background" | "upscale"
  inputAssetIds: string[]
  maskAssetId?: string
  prompt?: string
  parameters: Record<string, unknown>
  providerId: string
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled"
  outputAssetIds: string[]
  createdAt: string
}
```

This model supports undo, retry, cost display, and version restoration without requiring users to understand a graph.

### 4.3 Provider abstraction

The editor talks to a provider adapter with a common capability contract:

```ts
type ImageProvider = {
  id: string
  name: string
  authMode: "managed_cloud" | "user_api_key"
  capabilities: string[]
  createJob(input: ImageJobInput): Promise<{ jobId: string }>
  getJobStatus(jobId: string): Promise<JobStatus>
  cancelJob(jobId: string): Promise<void>
}
```

Initial providers:

- the product's managed cloud gateway;
- OpenAI Images;
- Stability AI;
- Replicate or another provider with a stable REST API;
- a configurable OpenAI-compatible image endpoint when its capabilities match the contract.

Provider adapters translate the shared operation input into vendor requests and map vendor responses back into the shared result format. Unsupported options must be hidden or marked unsupported rather than silently ignored.

### 4.4 Credentials and privacy

- Managed-cloud session tokens may be stored in the Tauri application data directory and managed per login session.
- User API keys are stored in a local SQLite database with provider, label, base URL, key, enabled state, and creation time fields.
- User API keys are intentionally stored in plaintext and are viewable, copyable, editable, and deletable from settings.
- The SQLite file lives in the Tauri application data directory. API keys are not duplicated in project manifests, operation history, image files, or logs.
- Plaintext SQLite means other programs running with access to the local account may read the keys. The settings UI must show this risk; encryption or an OS keychain is not a required dependency for this product decision.
- In user-key mode, the desktop app sends image requests directly to the provider. In managed-cloud mode, the desktop app sends requests only to the product cloud service.

## 5. Managed cloud service

The managed cloud service is the existing project at `/Users/szys/AI/video-maker/cloud`. It already provides identity, model discovery, balance, billing, and a unified model gateway. The desktop app should reuse those APIs instead of creating a second cloud protocol.

The first desktop integration uses:

- `GET /api/auth/me` for the current user;
- password or email-code login endpoints and `POST /api/auth/refresh` for desktop sessions;
- `GET /api/model-gateway/v1/models` for image models, capabilities, and constraints;
- `GET /api/model-gateway/v1/balance` for the account balance;
- `POST /api/model-gateway/v1/images/generations` for text-to-image and sketch-to-image;
- `POST /api/model-gateway/v1/images/edits` for image-to-image, inpainting, and mask edits;
- `POST /api/model-gateway/v1/quotes` for preflight pricing;
- account top-up and usage endpoints for balance and consumption details.

Requests include `Authorization: Bearer <accessToken>`, `X-MOVIVIZ-Client: desktop`, and a unique `Idempotency-Key` for each billable operation. The client uses the platform model `code` returned by the cloud service and never exposes provider model IDs.

The cloud service contains separate boundaries:

- identity and account service;
- balance, payment, and usage ledger;
- provider gateway and model routing;
- asynchronous job service;
- temporary task state and optional short-lived caching;
- administrative controls for rate limits, refunds, abuse prevention, and provider outages.

Every billable request gets an idempotency key. The ledger records reserved, consumed, refunded, and expired units. A failed provider task must not silently consume the full amount; the service needs an explicit refund or partial-consumption policy.

Managed-cloud image output follows a local-only policy. The service may temporarily retrieve an upstream image while a request is running, but after completion it returns the image content to the desktop client. The desktop client writes it to the local project. Final user images are not retained in the cloud project library; any temporary server file created for an upstream URL must have a short expiry and be deleted.

The desktop client should receive cost estimates before submission when the provider supports estimation. Actual consumption and the provider request ID are recorded after completion.

## 6. Open source boundary

The recommended repositories are:

- `desktop`: Tauri desktop application;
- `operation-schema`: versioned operation and project schema;
- `provider-sdk`: adapter contract and community adapters;
- `cloud-gateway`: deployable reference gateway, if you want self-hosting;
- `cloud-console`: account, balance, usage, and operations console.

The client, schemas, and SDK should be open source. The official hosted service may run the same gateway while keeping payment operations, abuse controls, provider contracts, and production infrastructure separately managed.

## 7. MVP scope

### Release 1

- Windows and macOS desktop packaging;
- new/open/save project;
- layers, brush, eraser, selection, mask, crop, zoom, undo, and redo;
- sketch-to-image, text-to-image, image-to-image, inpaint, background removal, and upscale;
- managed-cloud sign-in and balance display;
- user API key configuration for the first providers;
- asynchronous progress, cancellation, retry, and clear error states;
- variants, before/after comparison, operation history, and image export;
- versioned project manifest and local asset storage.

### Later releases

- project templates and reusable presets;
- batch operations;
- collaboration and cloud project sync;
- provider marketplace and community adapters;
- optional advanced automation or workflow view, only after canvas usage is validated.

Explicitly out of scope for the first release: local model inference, model weight management, ComfyUI import/export, visible node graphs, plugin sandboxes, team collaboration, and a full timeline editor.

## 8. Main risks and mitigations

- **Provider differences**: use capability discovery and hide unsupported controls.
- **Long-running or failed jobs**: use an asynchronous job state machine with cancellation, retry, timeout, and idempotency.
- **Cloud billing disputes**: show estimates, reserve credits before execution, and keep a complete usage ledger.
- **Large project files**: store assets separately from the manifest, generate thumbnails, and add explicit cache cleanup.
- **Canvas performance**: keep preview resolution separate from export resolution and move expensive image processing off the UI thread.
- **Plaintext credential exposure**: plaintext SQLite satisfies the product requirement but allows other local programs to read keys; show the risk in settings and keep keys out of logs and project files.
- **Cloud image retention**: allow only short-lived task caching, download results to the desktop, and regularly delete temporary server files.

## 9. Success criteria

The first release is successful when a new user can create a project, sketch or upload an image, run an AI operation, compare variants, continue editing on the canvas, and export a result without seeing a node graph or learning provider-specific request formats. A technically advanced user must be able to connect either a supported API key or the managed cloud service and see clear cost, status, and failure information.
