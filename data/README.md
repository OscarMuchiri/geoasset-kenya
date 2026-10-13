# Data workspace

Raw and processed spatial datasets are intentionally excluded from Git history.

Use the following local structure:

```text
data/
├── raw/        # downloaded source files, unchanged
└── processed/  # normalized files produced by ingestion scripts
```

Dataset provenance, licensing and source links are documented in [../docs/DATA_SOURCES.md](../docs/DATA_SOURCES.md).

Do not commit large source datasets or represent synthetic operational attributes as authoritative utility records.
