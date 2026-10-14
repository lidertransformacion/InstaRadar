.PHONY: install run test

PORT ?= 3847

install:
	npm install
	npx playwright install chromium

run:
	PORT=$(PORT) npm run dev

test:
	npm test
