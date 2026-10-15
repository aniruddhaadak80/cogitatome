# Corpus

`GET /api/v1/corpus?q=&kind=&tag=&limit=25&offset=0` → `{query, total,
entries[], facets[]}`. BM25 (k1 1.2, b 0.75; title 3, tags 2.5, one-liner 2,
abstract 0.6) over ~640 entries, in-process, no network.

```powershell
curl -s "http://localhost:3000/api/v1/corpus?q=sleeper%20agents&limit=3"
```

Simpler: open [/corpus?q=sleeper+agents](http://localhost:3000/corpus?q=sleeper+agents)
— the page is server-rendered from this route, so the URL *is* the query.

`POST /api/v1/corpus/suggest` with `{q}` returns up to 8 prefix completions
from the index vocabulary (command palette + search-as-you-type use it).
Full story: [corpus search guide](../guides/corpus-search.md).
