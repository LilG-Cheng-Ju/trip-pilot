"""Tripilot standalone MCP server package."""

from tripilot_mcp.client import TripilotAPIError, TripilotClient

__all__ = ["TripilotAPIError", "TripilotClient", "__version__"]
__version__ = "0.1.0"
