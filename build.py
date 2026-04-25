#!/usr/bin/env python3
"""
Build bookmarks.html from bookmarks.md.

Source of truth is bookmarks.md. This script replaces the content between
<!-- ENTRIES:START --> and <!-- ENTRIES:END --> markers in bookmarks.html
with HTML generated from the markdown.

Markdown schema:
  ## Section heading
  ### [Title](url) — Author
  Note paragraph (one block, may contain _italic_).
  > A blockquote becomes a pull quote.
  > Lines on consecutive `>` lines join into one quote.
  > Blank line separates quotes.

Run: python build.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "bookmarks.md"
DST = ROOT / "bookmarks.html"
START = "<!-- ENTRIES:START -->"
END = "<!-- ENTRIES:END -->"

ENTRY_HEADER = re.compile(r"^\[(.+?)\]\((.+?)\)\s*—\s*(.+)$")


def escape(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_inline(s: str) -> str:
    """Escape HTML, then convert _italic_ / *italic* to <i>...</i>."""
    s = escape(s)
    s = re.sub(r"(?<!\w)_([^_\n]+?)_(?!\w)", r"<i>\1</i>", s)
    s = re.sub(r"(?<!\w)\*([^*\n]+?)\*(?!\w)", r"<i>\1</i>", s)
    return s


def parse(md: str):
    """Parse markdown into a list of {name, entries} sections."""
    sections = []
    section = None
    entry = None
    note_lines = []
    quotes = []
    cur_quote = []
    in_fence = False  # ignore content inside ```...```
    in_html_comment = False  # ignore content inside <!-- ... -->

    def flush_quote():
        if cur_quote:
            quotes.append(" ".join(cur_quote).strip())
            cur_quote.clear()

    def flush_entry():
        nonlocal entry
        flush_quote()
        if entry is not None:
            entry["note"] = " ".join(l.strip() for l in note_lines).strip()
            entry["quotes"] = list(quotes)
            section["entries"].append(entry)
        entry = None
        note_lines.clear()
        quotes.clear()

    for raw in md.splitlines():
        line = raw.rstrip()

        if line.startswith("```"):
            in_fence = not in_fence
            continue
        if in_fence:
            continue

        # Skip HTML comment blocks (single- or multi-line).
        if in_html_comment:
            if "-->" in line:
                in_html_comment = False
            continue
        if line.lstrip().startswith("<!--"):
            if "-->" not in line:
                in_html_comment = True
            continue

        # `---` is a soft boundary: closes any open entry but does not start one.
        if line.strip() == "---":
            flush_entry()
            continue

        if line.startswith("## "):
            flush_entry()
            section = {"name": line[3:].strip(), "entries": []}
            sections.append(section)
        elif line.startswith("### "):
            if section is None:
                raise ValueError(f"Entry before any section: {line!r}")
            flush_entry()
            header = line[4:].strip()
            m = ENTRY_HEADER.match(header)
            if not m:
                raise ValueError(f"Bad entry header: {header!r}")
            entry = {
                "title": m.group(1).strip(),
                "url": m.group(2).strip(),
                "by": m.group(3).strip(),
            }
        elif line.startswith(">"):
            cur_quote.append(line[1:].lstrip())
        elif line.strip() == "":
            flush_quote()
        else:
            if entry is not None:
                note_lines.append(line)
            # else: prose outside any entry (front matter / docs) — ignore

    flush_entry()
    return sections


def render(sections) -> str:
    out = []
    for sec in sections:
        out.append(f"\t\t<h2>{escape(sec['name'])}</h2>\n\n")
        for e in sec["entries"]:
            title = escape(e["title"])
            url = e["url"].replace("&", "&amp;")
            by = escape(e["by"])
            note = render_inline(e["note"])

            if e["quotes"]:
                out.append('\t\t<div class="entry">\n')
                out.append('\t\t\t<div class="entry-body">\n')
                out.append(
                    f'\t\t\t\t<a class="title" href="{url}" target="_new">{title}</a> '
                    f'<span class="by">— {by}</span>\n'
                )
                out.append(f'\t\t\t\t<span class="note">{note}</span>\n')
                out.append('\t\t\t</div>\n')
                out.append('\t\t\t<aside class="quotes">\n')
                for q in e["quotes"]:
                    out.append(f'\t\t\t\t<blockquote>{render_inline(q)}</blockquote>\n')
                out.append('\t\t\t</aside>\n')
                out.append('\t\t</div>\n\n')
            else:
                out.append('\t\t<div class="entry">\n')
                out.append(
                    f'\t\t\t<a class="title" href="{url}" target="_new">{title}</a> '
                    f'<span class="by">— {by}</span>\n'
                )
                out.append(f'\t\t\t<span class="note">{note}</span>\n')
                out.append('\t\t</div>\n\n')

    return "".join(out).rstrip() + "\n"


def main():
    md = SRC.read_text()
    sections = parse(md)
    if not sections:
        sys.exit(f"No sections parsed from {SRC.name}")
    body = render(sections)

    html = DST.read_text()
    if START not in html or END not in html:
        sys.exit(f"Missing {START} / {END} markers in {DST.name}")

    pre, _, rest = html.partition(START)
    _, _, post = rest.partition(END)

    new_html = f"{pre}{START}\n{body}\t\t{END}{post}"
    DST.write_text(new_html)

    n_entries = sum(len(s["entries"]) for s in sections)
    print(f"wrote {DST.name}: {len(sections)} sections, {n_entries} entries")


if __name__ == "__main__":
    main()
