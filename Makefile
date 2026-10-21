.PHONY: install run test import daily-import avatars

PORT ?= 3847

install:
	npm install
	npx playwright install chromium

run:
	PORT=$(PORT) npm run dev

test:
	npm test

import:
	@if [ -z "$(FILE)" ]; then echo "Usage: make import FILE=path.json"; exit 1; fi
	NODE_OPTIONS='--experimental-sqlite --experimental-strip-types' node scripts/import.mjs "$(FILE)"

daily-import:
	@if [ -z "$(FILE)" ]; then echo "Usage: make daily-import FILE=path.json OUT=cloudflare/dist/daily-search.sql"; exit 1; fi
	NODE_OPTIONS='--experimental-strip-types' node scripts/daily-import.mjs "$(FILE)" --out "$(if $(OUT),$(OUT),cloudflare/dist/daily-search.sql)"

avatars:
	@if [ -z "$(DIR)" ]; then echo "Usage: make avatars DIR=folder"; exit 1; fi
	node scripts/import-avatars.mjs "$(DIR)"
