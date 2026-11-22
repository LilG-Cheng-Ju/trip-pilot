"""Static IATA airport reference model for Great-Circle flight calculations."""

from sqlalchemy import Float, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Airport(Base):
    """Commercial airport reference entry keyed by 3-letter IATA code."""

    __tablename__ = "airports"

    iata: Mapped[str] = mapped_column(String(3), primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    country_code: Mapped[str] = mapped_column(String(2), index=True, nullable=False)
    latitude: Mapped[float] = mapped_column(Float, nullable=False)
    longitude: Mapped[float] = mapped_column(Float, nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
