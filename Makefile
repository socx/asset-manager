.PHONY: dev stop build test lint type-check migrate db\:seed db\:studio db\:generate

dev:
	npm run dev

stop:
	bash dev/stop.sh

build:
	npm run build

test:
	npm run test

lint:
	npm run lint

type-check:
	npm run type-check

migrate:
	npm run db:generate
	npm run db:migrate

db\:seed:
	npm run db:seed

db\:studio:
	npm run db:studio

db\:generate:
	npm run db:generate
