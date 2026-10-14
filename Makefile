.PHONY: install run test import

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
