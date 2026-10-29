# ToyFlow

Repository for the ToyFlow graduation project.

## Workspace structure

```text
graduation-project-fall26/
├── server/   # TypeScript, Express, MongoDB and Socket.IO backend
└── client/   # Reserved for the future frontend base
```

The frontend team can add `client/` without changing or mixing with backend dependencies.

## Start the backend

```bash
cd server
npm install
copy .env.example .env
npm run dev
```

> **Note**: The rental order and wallet features use MongoDB multi-document transactions (`withTransaction`), which require MongoDB to run as a replica set.
> - For local development: start `mongod --replSet rs0` and run `rs.initiate()` in `mongosh`.
> - Automated Vitest tests use an in-memory replica set (`mongodb-memory-server`) automatically without needing a local mongod daemon.

See [server/README.md](server/README.md) for the backend architecture, business-module mapping and available commands.
