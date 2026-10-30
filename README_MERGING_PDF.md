# Merging PDF feature - pivot-fill-v3

This build uses port **5503** deliberately so an older merge server on port 5502 cannot return stale two-row results.

## Start

```bat
python -m pip install -r requirements.txt
python merge_server.py
```

Health check: `http://127.0.0.1:5503/api/merge/health`

Expected response includes `"parserVersion": "pivot-fill-v3"`.

For `202610 Consumables ADEO.xlsx`, Inspect report must return six documents:

- 607598: 5644666, 5651828, 2602948
- 609007: 2651090139, IN125663, VFRF2600043

The parser carries the pivot-style Segment4 parent value down to subsequent detail rows, while creating requirements only where External Document Nr. is explicitly present.


### Repeated document references
If the same External Document Nr. appears on two or more Pivot rows, it is consolidated by its normalized lookup key. The user uploads one PDF, and it is merged once at the position of the first Pivot-table occurrence.
