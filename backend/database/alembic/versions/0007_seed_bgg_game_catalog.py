"""Siembra un catalogo inicial limitado de juegos BGG.

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-31
"""

import unicodedata
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.sql.selectable import TableClause

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GAMES_TABLE = "games"
MANUALS_TABLE = "manuals"
SEED_GAME_LIMIT = 100

BGG_SEED_GAMES: tuple[tuple[int, str, int | None], ...] = (
    (174430, "Gloomhaven", 2017),
    (224517, "Brass: Birmingham", 2018),
    (161936, "Pandemic Legacy: Season 1", 2015),
    (342942, "Ark Nova", 2021),
    (233078, "Twilight Imperium: Fourth Edition", 2017),
    (316554, "Dune: Imperium", 2020),
    (167791, "Terraforming Mars", 2016),
    (115746, "War of the Ring: Second Edition", 2011),
    (291457, "Gloomhaven: Jaws of the Lion", 2020),
    (187645, "Star Wars: Rebellion", 2016),
    (162886, "Spirit Island", 2017),
    (220308, "Gaia Project", 2017),
    (182028, "Through the Ages: A New Story of Civilization", 2015),
    (12333, "Twilight Struggle", 2005),
    (193738, "Great Western Trail", 2016),
    (84876, "The Castles of Burgundy", 2011),
    (169786, "Scythe", 2016),
    (173346, "7 Wonders Duel", 2015),
    (246900, "Eclipse: Second Dawn for the Galaxy", 2020),
    (28720, "Brass: Lancashire", 2007),
    (177736, "A Feast for Odin", 2016),
    (96848, "Mage Knight Board Game", 2011),
    (124361, "Concordia", 2013),
    (312484, "Lost Ruins of Arnak", 2020),
    (237182, "Root", 2018),
    (102794, "Caverna: The Cave Farmers", 2013),
    (216132, "Clans of Caledonia", 2017),
    (266192, "Wingspan", 2019),
    (199792, "Everdell", 2018),
    (183394, "Viticulture Essential Edition", 2015),
    (3076, "Puerto Rico", 2002),
    (31260, "Agricola", 2007),
    (324856, "The Crew: Mission Deep Sea", 2021),
    (167355, "Nemesis", 2018),
    (256960, "Pax Pamir: Second Edition", 2019),
    (251247, "Barrage", 2019),
    (276025, "Maracaibo", 2019),
    (180263, "The 7th Continent", 2017),
    (264220, "Tainted Grail: The Fall of Avalon", 2019),
    (192135, "Too Many Bones", 2017),
    (191189, "Aeon's End", 2016),
    (205637, "Arkham Horror: The Card Game", 2016),
    (124742, "Android: Netrunner", 2012),
    (28143, "Race for the Galaxy", 2007),
    (164928, "Orleans", 2014),
    (2651, "Power Grid", 2004),
    (295947, "Cascadia", 2021),
    (230802, "Azul", 2017),
    (13, "Catan", 1995),
    (822, "Carcassonne", 2000),
    (9209, "Ticket to Ride", 2004),
    (178900, "Codenames", 2015),
    (36218, "Dominion", 2008),
    (30549, "Pandemic", 2008),
    (68448, "7 Wonders", 2010),
    (148228, "Splendor", 2014),
    (204583, "Kingdomino", 2016),
    (129622, "Love Letter", 2012),
    (39856, "Dixit", 2008),
    (192291, "Sushi Go Party!", 2016),
    (244521, "The Quacks of Quedlinburg", 2018),
    (244992, "The Mind", 2018),
    (254640, "Just One", 2018),
    (225694, "Decrypto", 2018),
    (181304, "Mysterium", 2015),
    (157969, "Sheriff of Nottingham", 2014),
    (40692, "Small World", 2009),
    (41114, "The Resistance", 2009),
    (188834, "Secret Hitler", 2016),
    (46213, "Telestrations", 2009),
    (70323, "King of Tokyo", 2011),
    (194655, "Santorini", 2016),
    (163412, "Patchwork", 2014),
    (54043, "Jaipur", 2009),
    (2655, "Hive", 2000),
    (160477, "Onitama", 2014),
    (624, "Quoridor", 1997),
    (171, "Chess", None),
    (181, "Risk", 1959),
    (1406, "Monopoly", 1935),
    (1294, "Clue", 1949),
    (320, "Scrabble", 1948),
    (2223, "UNO", 1971),
    (284083, "The Crew: The Quest for Planet Nine", 2019),
    (131357, "Coup", 2012),
    (10547, "Betrayal at House on the Hill", 2004),
    (150376, "Dead of Winter: A Crossroads Game", 2014),
    (205059, "Mansions of Madness: Second Edition", 2016),
    (146021, "Eldritch Horror", 2013),
    (113924, "Zombicide", 2012),
    (170216, "Blood Rage", 2015),
    (185343, "Anachrony", 2017),
    (266810, "Paladins of the West Kingdom", 2019),
    (236457, "Architects of the West Kingdom", 2018),
    (170042, "Raiders of the North Sea", 2015),
    (126163, "Tzolk'in: The Mayan Calendar", 2012),
    (229853, "Teotihuacan: City of Gods", 2018),
    (247763, "Underwater Cities", 2018),
    (161533, "Lisboa", 2017),
    (284378, "Kanban EV", 2020),
)


def upgrade() -> None:
    """Inserta una semilla inicial idempotente para el typeahead local."""
    games = _games_table()
    op.execute(
        insert(games)
        .values(_seed_rows())
        .on_conflict_do_nothing(
            index_elements=[games.c.bgg_id],
            index_where=sa.text("bgg_id IS NOT NULL AND deleted_at IS NULL"),
        )
    )


def downgrade() -> None:
    """Elimina solo juegos sembrados que no tengan manuales asociados."""
    bgg_ids = ", ".join(str(bgg_id) for bgg_id, _, _ in BGG_SEED_GAMES)
    op.execute(
        sa.text(
            f"""
            DELETE FROM {GAMES_TABLE}
            WHERE bgg_id IN ({bgg_ids})
              AND NOT EXISTS (
                  SELECT 1
                  FROM {MANUALS_TABLE}
                  WHERE {MANUALS_TABLE}.game_id = {GAMES_TABLE}.id
              )
            """
        )
    )


def _games_table() -> TableClause:
    """Define la tabla mínima que necesita la migración de datos."""
    return sa.table(
        GAMES_TABLE,
        sa.column("name", sa.String(length=255)),
        sa.column("name_key", sa.String(length=512)),
        sa.column("bgg_id", sa.Integer()),
        sa.column("year_published", sa.Integer()),
        sa.column("status", sa.String(length=16)),
    )


def _seed_rows() -> list[dict[str, str | int | None]]:
    """Normaliza la semilla inmutable antes de insertarla."""
    if len(BGG_SEED_GAMES) > SEED_GAME_LIMIT:
        raise RuntimeError("La semilla BGG supera el limite acordado.")

    return [
        {
            "name": name,
            "name_key": _seed_game_name_key(name),
            "bgg_id": bgg_id,
            "year_published": year_published,
            "status": "active",
        }
        for bgg_id, name, year_published in BGG_SEED_GAMES
    ]


def _seed_game_name_key(name: str) -> str:
    """Replica la clave de búsqueda usada por el runtime."""
    return unicodedata.normalize("NFKC", name.strip()).casefold()
