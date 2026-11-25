"""Outbound SSRF protection verifying resolved public IP addresses."""

import asyncio
import ipaddress
import socket


def _is_public_ip(raw_ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(raw_ip)
    except ValueError:
        return False
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_multicast
        or addr.is_reserved
        or addr.is_unspecified
    )


async def ensure_public_url_target(hostname: str | None) -> None:
    """Reject hostnames resolving to loopback, link-local, or private IP ranges."""
    if not hostname:
        raise ValueError("Missing target hostname")
    host = hostname.strip().rstrip(".")
    if not host:
        raise ValueError("Missing target hostname")

    # Literal IP hostnames can be checked without DNS resolution.
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        if not _is_public_ip(host):
            raise ValueError("Target IP address is not publicly routable")
        return

    loop = asyncio.get_running_loop()
    try:
        addr_info = await loop.getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError(f"Could not resolve target hostname: {host}") from exc

    resolved_ips = [str(entry[4][0]) for entry in addr_info if entry[4]]
    if not resolved_ips or any(not _is_public_ip(ip) for ip in resolved_ips):
        raise ValueError(f"Target hostname resolves to non-public address: {host}")
