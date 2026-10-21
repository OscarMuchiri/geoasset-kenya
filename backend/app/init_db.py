from pathlib import Path

from .db import engine


def main() -> None:
    schema_path = Path(__file__).resolve().parents[2] / "database" / "init.sql"
    schema_sql = schema_path.read_text(encoding="utf-8")

    statements = [
        statement.strip()
        for statement in schema_sql.split(";")
        if statement.strip()
    ]

    with engine.begin() as connection:
        for statement in statements:
            connection.exec_driver_sql(statement)

    print(f"Initialized GeoAsset schema from {schema_path}")


if __name__ == "__main__":
    main()
