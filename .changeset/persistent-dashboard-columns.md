---
"@kalayaan/admin": patch
---

Dashboard list view: persistent, field-aware columns with ID pinned first.

The collection browser's Columns menu now lists every content field in the collection (not just the
fixed Locales/Updated extras), so any field can be shown as its own column. Choices persist per
collection in `localStorage` and survive reloads, and the document `ID` is now always the first
column in every collection.
