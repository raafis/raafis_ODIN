from __future__ import annotations

import re
from typing import List


class KGIndexer:
    """Parse a *_knowledge_graph.md file (kg_tool output) into Cypher MERGE statements."""

    ENTITY_LINE = re.compile(r"^- \*\*\[\[(.+?)\]\]\*\*.*?— (.+)$")
    ALIAS_LINE = re.compile(r"^  - \*aliases:\*\s*(.+)$")
    REL_LINE = re.compile(r'^- \[\[(.+?)\]\] → \[\[(.+?)\]\] — "(.+)"$')

    # Map plural section headings → singular Cytoscape-friendly node label
    TYPE_MAP = {
        "roles": "Role",
        "concepts": "Concept",
        "technologies": "Technology",
        "processes": "Process",
        "outputs": "Output",
        "projects": "Project",
        "files": "File",
        "gap categories": "GapCategory",
        "environment variables": "EnvVar",
        "other": "Entity",
        "config/secret files": "File",
    }

    @classmethod
    def _label(cls, heading: str) -> str:
        return cls.TYPE_MAP.get(heading.lower(), heading.rstrip("s").capitalize())

    @staticmethod
    def _safe(s: str) -> str:
        return s.replace("\\", "\\\\").replace("'", "\\'")

    @classmethod
    def parse(cls, content: str, repo_path: str, file_path: str) -> List[str]:
        """Return a list of individual Cypher statements (one per list entry)."""
        stmts: List[str] = []
        in_entities = False
        in_relations = False
        current_type = "Entity"
        current_predicate = ""
        last_name: str | None = None

        for line in content.splitlines():
            stripped = line.strip()

            # Section detection
            if stripped == "## Entities":
                in_entities, in_relations = True, False
                continue
            if stripped == "## Relations":
                in_relations, in_entities = True, False
                continue
            if stripped.startswith("## "):
                in_entities = in_relations = False
                continue

            # --- Entity section ---
            if in_entities and stripped.startswith("### "):
                current_type = cls._label(stripped[4:])
                last_name = None
                continue

            if in_entities:
                m = cls.ENTITY_LINE.match(stripped)
                if m:
                    name = m.group(1).strip()
                    desc = m.group(2).strip()
                    stmts.append(
                        f"MERGE (n:{current_type} {{name: '{cls._safe(name)}', "
                        f"repo_path: '{cls._safe(repo_path)}', "
                        f"file_path: '{cls._safe(file_path)}'}}) "
                        f"ON CREATE SET n.description = '{cls._safe(desc)}'"
                    )
                    last_name = name
                    continue

                # Alias sub-bullet — use original line to preserve indentation
                a = cls.ALIAS_LINE.match(line)
                if a and last_name:
                    for alias in [x.strip().strip('"') for x in a.group(1).split(",")]:
                        if alias:
                            stmts.append(
                                f"MATCH (n {{name: '{cls._safe(last_name)}'}}) "
                                f"SET n.aliases = coalesce(n.aliases, '') + '|{cls._safe(alias)}'"
                            )
                continue

            # --- Relations section ---
            if in_relations and stripped.startswith("### "):
                current_predicate = stripped[4:].upper().replace(" ", "_")
                continue

            if in_relations:
                m = cls.REL_LINE.match(stripped)
                if m:
                    subj = m.group(1).strip()
                    obj = m.group(2).strip()
                    src = m.group(3).strip()
                    stmts.append(
                        f"MATCH (a {{name: '{cls._safe(subj)}'}}), "
                        f"(b {{name: '{cls._safe(obj)}'}}) "
                        f"MERGE (a)-[:{current_predicate} {{source: '{cls._safe(src)}'}}]->(b)"
                    )

        return stmts
