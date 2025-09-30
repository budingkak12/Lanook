# Repository Guidelines

## Project Structure & Module Organization
- Backend (FastAPI): `main.py` (routes, CORS, streaming), models and DB setup in `初始化数据库.py`.
- Data: `media_app.db` (SQLite), `sample_media/` (local media), `thumbnails/` (generated). Both are git‑ignored.
- Utilities: `generate_test_videos.py` (creates sample MP4s), `api_flow_test.py` (end‑to‑end API flow).
- Frontend (Vite + React + TS): `webapp/` with `src/pages/`, `src/store/`, and `src/lib/api.ts` (API client). Vite proxy targets the backend at `http://localhost:8000`.

## Build, Test, and Development Commands
- Backend
  - Create env and install deps: `python -m venv .venv && source .venv/bin/activate && pip install fastapi "uvicorn[standard]" sqlalchemy pydantic`.
  - Initialize DB (edit `MEDIA_DIRECTORY_TO_SCAN` if needed): `python 初始化数据库.py`.
  - Start API (reload): `python -m uvicorn main:app --reload --port 8000`.
  - Generate sample media (requires ffmpeg): `python generate_test_videos.py`.
- Frontend (in `webapp/`)
  - Install: `npm install` (or `npm ci`).
  - Dev server: `npm run dev` (proxied API: see `webapp/vite.config.ts`).
  - Build/preview: `npm run build` then `npm run preview`.
- Quick E2E check
  - With API running: `python api_flow_test.py` (override with `API_BASE_URL=http://127.0.0.1:8000`).

## Coding Style & Naming Conventions
- Python: PEP 8, 4‑space indent, type hints where practical. snake_case for functions/vars, PascalCase for classes. Keep route shapes stable with existing names (e.g., `/session`, `/thumbnail-list`).
- TypeScript/React: strict TS; camelCase for vars/functions; PascalCase for components (`pages/*.tsx`). Centralize HTTP in `src/lib/api.ts`; avoid ad‑hoc fetches in components.
- Formatting: Prefer auto‑format (Black for Python; Prettier/editor defaults for TS/JS). Keep imports sorted and unused code removed.

## Testing Guidelines
- Primary check: `api_flow_test.py` runs the documented API sequence in‑process (or via HTTP). Ensure it passes before sending a PR.
- If adding Python modules, place unit tests under `tests/` as `test_*.py` and run with `pytest -q` (optional but encouraged).

## Commit & Pull Request Guidelines
- Commits: concise, imperative. Conventional Commits preferred when possible (e.g., `feat: add tag filter to /thumbnail-list`, `fix: handle missing absolute_path`).
- PRs: include a clear description, steps to reproduce, screenshots/GIFs for UI changes, and notes on DB or API changes (update `webapp/vite.config.ts` and `src/lib/api.ts` if routes change).

## Security & Configuration Tips
- Set `MEDIA_DIRECTORY_TO_SCAN` (absolute path recommended) before initializing the DB. Do not commit personal media.
- ffmpeg is required for thumbnails and sample video generation. Install and ensure it’s on PATH.
