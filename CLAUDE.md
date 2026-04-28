# Athian Vault

Obsidian vault for the **Athian Sustainability Platform** — a cloud-native microservices architecture on AWS using Domain-Driven Design (DDD). This vault is software architecture documentation only.

## Conventions

- **Wikilinks**: Always use `[[Note Name]]` for internal links, never markdown links
- **Diagrams**: Stored as `.drawio.png` files in a `_draw.io/` subfolder relative to the note; embedded as `![[filename.drawio.png|600]]`. These are draw.io's combined format — a valid PNG with the full XML source embedded, so one file is both the editable source and the rendered image.
- **No frontmatter** on notes unless explicitly added
- **Note names** match folder names when a note is the index for that folder (e.g. `Asset Management/Asset Management.md`)

## Draw.io Workflow

Diagrams are created/edited visually in draw.io and exported as `.png` into the local `_draw.io/` folder. Claude can scaffold diagram structure (XML) but cannot render visuals — final export is done manually.
