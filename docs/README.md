# pod docs

Design docs for understanding how pod works and how to build new skills.

| Doc | Read when |
|---|---|
| [architecture.md](architecture.md) | You want to understand the design philosophy — why pod is built the way it is, what the closure property means, how data flows |
| [data-model.md](data-model.md) | You're deciding where to put a new piece of content, or trying to avoid overlap between thesis / library / theme / position |
| [entities.md](entities.md) | You're writing a new skill and need the exhaustive inventory of what pod reasons about |

These three are companion documents. They describe the same system from different angles:

- **architecture.md** = the WHY (principles, philosophy, core invariants)
- **data-model.md** = the HOW (three layers, scopes, anti-overlap rules)
- **entities.md** = the WHAT (catalog reference, every entity by name)

If you're building a new pod skill, start with entities.md (know what's there), then data-model.md (know where to read/write), then architecture.md (know the rules).
