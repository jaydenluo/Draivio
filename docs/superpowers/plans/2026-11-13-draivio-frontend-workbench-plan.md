# Draivio Frontend Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable Draivio desktop-workbench frontend matching the approved four-zone canvas design.

**Architecture:** Use a Vite React TypeScript app that keeps the editor state in a small React context. The UI is split into top bar, tool rail, canvas area, inspector tabs, and history strip. The first pass uses a local SVG illustration as the canvas fixture and simulated generation states; Tauri commands and cloud/API integrations are added after the UI is stable.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, CSS variables, Lucide-style text/icon placeholders, and Tauri 2 integration scaffolding.

---

### Task 1: Bootstrap the frontend app

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/vite-env.d.ts`
- Create: `src/app/App.tsx`
- Test: `src/app/App.test.tsx`

- [x] **Step 1: Write the failing smoke test**

Create `src/app/App.test.tsx` with a test that expects the approved workbench landmarks:

```tsx
import { render, screen } from '@testing-library/react'
import { App } from './App'

test('renders the Draivio workbench landmarks', () => {
  render(<App />)
  expect(screen.getByText('Draivio')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '主画布' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '生成' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '操作历史' })).toBeInTheDocument()
})
```

- [x] **Step 2: Run the test and verify it fails**

Run: `npm test -- --run src/app/App.test.tsx`

Expected: FAIL because the Vite app and `App` component do not exist.

- [x] **Step 3: Add the Vite and test configuration**

Add scripts for `dev`, `build`, `preview`, and `test`. Configure Vitest with `jsdom`, `src/test/setup.ts`, and the React JSX transform. Add the minimum React, Vite, TypeScript, Vitest, Testing Library, and jsdom dependencies.

- [x] **Step 4: Add the minimal App and entry point**

Implement `src/app/App.tsx` with the four landmark regions and `src/main.tsx` with `createRoot(document.getElementById('root')!).render(<App />)`.

- [x] **Step 5: Run the smoke test and build**

Run: `npm test -- --run src/app/App.test.tsx && npm run build`

Expected: PASS and a successful Vite production build.

### Task 2: Implement the approved four-zone shell

**Files:**
- Create: `src/app/AppShell.tsx`
- Create: `src/components/TopBar.tsx`
- Create: `src/components/ToolRail.tsx`
- Create: `src/components/Inspector.tsx`
- Create: `src/components/HistoryStrip.tsx`
- Create: `src/styles/theme.css`
- Modify: `src/app/App.tsx`
- Test: `src/components/AppShell.test.tsx`

- [x] **Step 1: Write the failing layout test**

Test that the shell renders the four zones, the right panel tabs, and the primary generation action.

- [x] **Step 2: Run the layout test to verify the expected failure**

Run: `npm test -- --run src/components/AppShell.test.tsx`

Expected: FAIL because the shell components are not implemented.

- [x] **Step 3: Implement the shell components and design tokens**

Use the approved dimensions: top bar `52px`, tool rail `64px`, inspector `320px`, history strip `128px`. Add the dark ink palette, paper canvas token, coral primary action, blue selection color, typography, focus rings, and reduced-motion media query.

- [x] **Step 4: Run the layout test**

Run: `npm test -- --run src/components/AppShell.test.tsx`

Expected: PASS with all landmarks present.

### Task 3: Add canvas and drawing-tool state

**Files:**
- Create: `src/canvas/CanvasViewport.tsx`
- Create: `src/canvas/CanvasFixture.tsx`
- Create: `src/state/editor.ts`
- Modify: `src/components/ToolRail.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/canvas/CanvasViewport.test.tsx`

- [x] **Step 1: Write the failing canvas behavior test**

The test selects the brush and selection tools and asserts that the active tool label and selection overlay state update.

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run src/canvas/CanvasViewport.test.tsx`

Expected: FAIL because tool state and canvas rendering are missing.

- [x] **Step 3: Implement the canvas fixture and editor state**

Render a local SVG poster fixture inside the canvas viewport. Keep the canvas state in a reducer with `activeTool`, `selectionVisible`, `zoom`, and `selectedLayerId`. Selecting `selection` or `mask` shows the blue selection overlay.

- [x] **Step 4: Run the canvas test**

Run: `npm test -- --run src/canvas/CanvasViewport.test.tsx`

Expected: PASS.

### Task 4: Implement inspector operations and history interactions

**Files:**
- Create: `src/creation/GenerationPanel.tsx`
- Create: `src/creation/EditPanel.tsx`
- Create: `src/layers/LayersPanel.tsx`
- Create: `src/history/ResultThumbnail.tsx`
- Modify: `src/components/Inspector.tsx`
- Modify: `src/components/HistoryStrip.tsx`
- Test: `src/creation/Inspector.test.tsx`

- [x] **Step 1: Write failing interaction tests**

Cover three behaviors: switching tabs shows the matching panel, clicking `生成图片` enters a loading state and returns to the ready state, and clicking a history thumbnail marks it active.

- [x] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --run src/creation/Inspector.test.tsx`

Expected: FAIL because the panels and interaction state do not exist.

- [x] **Step 3: Implement the panels and simulated generation state**

Build the generation panel with operation choices, prompt input, model, size, quantity, estimated credits, primary button, and more-settings button. Build edit and layers panels with the same visual language. The simulated generation action must show `生成中…` and then append a local result thumbnail.

- [x] **Step 4: Run the interaction tests**

Run: `npm test -- --run src/creation/Inspector.test.tsx`

Expected: PASS.

### Task 5: Verify the reviewable frontend

**Files:**
- Modify: `src/styles/theme.css`
- Modify: `README.md`
- Test: `src/app/App.test.tsx`, `src/components/AppShell.test.tsx`, `src/canvas/CanvasViewport.test.tsx`, `src/creation/Inspector.test.tsx`

- [x] **Step 1: Run all tests**

Run: `npm test -- --run`

Expected: PASS with no failing tests.

- [x] **Step 2: Run the production build**

Run: `npm run build`

Expected: Vite outputs a production bundle under `dist/`.

- [x] **Step 3: Run the local preview**

Run: `npm run dev -- --host 127.0.0.1`

Expected: the workbench opens with the four-zone layout and all three inspector tabs respond to clicks.

- [x] **Step 4: Document the current scope**

Update `README.md` with the local commands and state clearly that generation is simulated in this first frontend pass; cloud calls, SQLite API keys, and Tauri commands come in the next integration pass.
