"""Demo data per module. Each module in this package may define
seed(session); seed_demo.main() runs them all (idempotently) after the core
participants, templates and submissions exist."""

import importlib
import pkgutil

from sqlmodel import Session


def run_all(session: Session) -> None:
    for module in sorted(pkgutil.iter_modules(__path__), key=lambda m: m.name):
        seed = getattr(importlib.import_module(f"{__name__}.{module.name}"), "seed", None)
        if seed is not None:
            seed(session)
