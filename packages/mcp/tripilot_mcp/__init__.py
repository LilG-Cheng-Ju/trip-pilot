"""Tripilot standalone MCP server package."""

from importlib.metadata import PackageNotFoundError, version

from tripilot_mcp.client import TripilotAPIError, TripilotClient

try:
    __version__ = version("tripilot-mcp")
except PackageNotFoundError:  # pragma: no cover - editable source fallback
    __version__ = "0.9.2"

__all__ = ["TripilotAPIError", "TripilotClient", "__version__"]
