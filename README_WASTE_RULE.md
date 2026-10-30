# Segment4 607599 waste-document rule

Account **607599** (waste) is handled separately from the invoice accounts (609007 / 601101 and 607598).

## Why it is separate

In the Overview report, 607599 rows usually have `(blank)` in External Document Nr. (column F). The only reference is in the Description column (for example `Renewi 8692893/8692894 2026/08`). One cost line can also be backed by several waste PDFs. So the number of required documents **cannot be determined from the report**, and waste PDFs are **not matched by document number**.

## Rule

If Segment4 607599 is present anywhere in the Overview sheet (including collapsed `607599 Total` rows), the user must upload **all** waste-related PDFs. The merge is blocked until at least one valid waste PDF is supplied.

## API fields returned by `/api/merge/inspect-report`

| Field | Meaning |
|---|---|
| `wasteDocumentsRequired` | `true` when 607599 is present. This is the only field the UI should use to decide. |
| `wasteDocumentCount` | Always `null` (unknown by design). Do not display it as a number. |
| `wasteDocumentCountKnown` | Always `false`. |
| `wasteDocuments` | Hints only: waste rows that do have an External Document Nr. (number, remarks, row). Often empty. |
| `wasteDescriptions` | Description text of every 607599 row, shown to the user as hints of what to upload. |
| `emptyDocumentRows` | No longer includes 607599 rows. |

## Merge behavior (`/api/merge/process`)

- Waste PDFs are sent in the `wasteFiles` field (multiple files allowed).
- Blocks with a 422 if the waste upload is missing, any waste PDF is unreadable, or the same waste file name is uploaded twice.
- Valid waste PDFs are appended after the matched invoices, in upload order.
- Waste files are never guessed or matched against invoice numbers, so there is no "ambiguous waste document" case.

## Frontend

`script.js` shows an alert telling the user to upload ALL waste PDFs, lists the report's waste lines as hints, and keeps the Process button disabled until at least one waste PDF is selected. The report cannot confirm that every waste document was supplied, so the user remains responsible for completeness.

`waste_rule_frontend_patch.js` is obsolete; its logic is now part of `script.js`.
